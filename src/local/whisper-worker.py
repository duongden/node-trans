#!/usr/bin/env python3
"""
Persistent Whisper STT worker for node-trans.
Loads the model once at startup, then processes audio continuously via stdin.

Protocol IN  (newline-delimited JSON):
  {"type": "audio",    "data": "<base64-pcm-s16le>"}
  {"type": "flush"}
  {"type": "shutdown"}

Protocol OUT (newline-delimited JSON):
  {"type": "ready"}
  {"type": "partial",   "text": "..."}   -- growing in-progress text
  {"type": "utterance", "text": "..."}   -- final committed utterance
  {"type": "error",     "message": "..."}
"""

import sys
import os
import json
import base64
import wave
import tempfile
import threading
import time

import numpy as np
import whisper

SAMPLE_RATE = 16000
BYTES_PER_SAMPLE = 2

# Sliding-window parameters
WINDOW_SECS = 6.0        # inference window length
STRIDE_SECS = 4.0        # advance per window; keeps 2 s overlap for context
MIN_FLUSH_SECS = 1.0     # minimum audio required for a forced flush
SILENCE_RMS = 300        # RMS below this is considered silence
SILENCE_FLUSH_SECS = 1.5 # flush window early after this much silence
UTTERANCE_SILENCE = 2    # consecutive empty windows → emit utterance


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def pcm_rms(data):
    if len(data) < 2:
        return 0.0
    s = np.frombuffer(data, dtype=np.int16).astype(np.float32)
    return float(np.sqrt(np.mean(s * s)))


def write_wav(pcm, path):
    with wave.open(path, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm)


class WhisperWorker:
    def __init__(self, model_name, language, translate):
        self.model_name = model_name
        self.language = language    # None = auto-detect
        self.translate = translate  # True → task="translate" (force output to English)

        self.buf = bytearray()
        self.window_start = 0.0    # absolute time (s) of buf[0]
        self.last_end = 0.0        # last committed segment end for dedup
        self.silence_bytes = 0
        self.empty_windows = 0
        self.accum = ""            # utterance accumulator (cleared on emit)
        self.processing = False
        self.lock = threading.Lock()

    def load(self):
        print(f"[whisper-worker] Loading model '{self.model_name}'…",
              file=sys.stderr, flush=True)
        self.model = whisper.load_model(self.model_name, device="cpu")
        emit({"type": "ready"})

    def add_audio(self, pcm):
        with self.lock:
            self.buf.extend(pcm)

            rms = pcm_rms(pcm)
            if rms < SILENCE_RMS:
                self.silence_bytes += len(pcm)
            else:
                self.silence_bytes = 0

            win_b    = int(SAMPLE_RATE * BYTES_PER_SAMPLE * WINDOW_SECS)
            stride_b = int(SAMPLE_RATE * BYTES_PER_SAMPLE * STRIDE_SECS)
            min_b    = int(SAMPLE_RATE * BYTES_PER_SAMPLE * MIN_FLUSH_SECS)
            sil_b    = int(SAMPLE_RATE * BYTES_PER_SAMPLE * SILENCE_FLUSH_SECS)

            full      = len(self.buf) >= win_b
            sil_flush = self.silence_bytes >= sil_b and len(self.buf) >= min_b

            if (full or sil_flush) and not self.processing:
                self.processing = True
                chunk = bytes(self.buf)
                t0 = self.window_start

                if not sil_flush:
                    # Sliding window: keep the overlap portion
                    self.buf = bytearray(self.buf[stride_b:])
                    self.window_start += STRIDE_SECS
                else:
                    self.buf = bytearray()
                self.silence_bytes = 0

                threading.Thread(
                    target=self._run,
                    args=(chunk, t0, sil_flush),
                    daemon=True,
                ).start()

    def flush(self):
        """Process whatever remains in the buffer immediately."""
        with self.lock:
            min_b = int(SAMPLE_RATE * BYTES_PER_SAMPLE * MIN_FLUSH_SECS)
            if self.processing or len(self.buf) < min_b:
                return
            self.processing = True
            chunk, t0 = bytes(self.buf), self.window_start
            self.buf = bytearray()
            threading.Thread(
                target=self._run, args=(chunk, t0, True), daemon=True
            ).start()

    def emit_accum(self):
        """Emit any accumulated utterance text (called from main loop on shutdown)."""
        if self.accum:
            emit({"type": "utterance", "text": self.accum})
            self.accum = ""

    def _run(self, pcm, t0, force_utterance):
        path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
                path = f.name
            write_wav(pcm, path)

            opts = {"verbose": False}
            if self.language:
                opts["language"] = self.language
            if self.translate:
                opts["task"] = "translate"

            result = self.model.transcribe(path, **opts)
            texts = []
            for seg in result.get("segments", []):
                abs_start = t0 + float(seg["start"])
                abs_end   = t0 + float(seg["end"])
                text = seg["text"].strip()

                if not text:
                    continue
                # Dedup: skip segments already committed in a previous overlap window
                if abs_start < self.last_end - 0.5:
                    continue

                texts.append(text)
                self.last_end = max(self.last_end, abs_end)

            if texts:
                self.empty_windows = 0
                self.accum = (self.accum + " " + " ".join(texts)).strip()
                emit({"type": "partial", "text": self.accum})
            else:
                self.empty_windows += 1

            if (force_utterance or self.empty_windows >= UTTERANCE_SILENCE) and self.accum:
                emit({"type": "utterance", "text": self.accum})
                self.accum = ""
                self.empty_windows = 0

        except Exception as e:
            emit({"type": "error", "message": str(e)})
        finally:
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass
            with self.lock:
                self.processing = False


def main():
    args = sys.argv[1:]
    model_name = "base"
    language = None
    translate = False

    i = 0
    while i < len(args):
        if args[i] == "--model" and i + 1 < len(args):
            model_name = args[i + 1]
            i += 2
        elif args[i] == "--language" and i + 1 < len(args):
            v = args[i + 1]
            language = None if v == "auto" else v
            i += 2
        elif args[i] == "--translate":
            translate = True
            i += 1
        else:
            i += 1

    worker = WhisperWorker(model_name, language, translate)
    worker.load()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            emit({"type": "error", "message": f"JSON decode: {e}"})
            continue

        t = msg.get("type")
        if t == "audio":
            worker.add_audio(base64.b64decode(msg["data"]))
        elif t == "flush":
            worker.flush()
        elif t == "shutdown":
            worker.flush()
            # Wait for any running inference thread (max 10 s)
            deadline = time.time() + 10
            while worker.processing and time.time() < deadline:
                time.sleep(0.1)
            worker.emit_accum()
            break

    print("[whisper-worker] Shutdown complete.", file=sys.stderr, flush=True)


if __name__ == "__main__":
    main()
