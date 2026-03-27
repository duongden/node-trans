/**
 * Local Whisper STT session — same interface as src/soniox/session.js.
 *
 * Audio is buffered in 3-second windows. Each window is written to a temp WAV
 * file, processed by whisper.cpp via nodejs-whisper, then the text is emitted
 * as a partial-result. After SILENCE_THRESHOLD consecutive silent windows the
 * accumulated text is emitted as a final utterance and the buffer resets.
 */

import { writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
import { translateText } from "./translate.js";

const SAMPLE_RATE = 16000;
const BYTES_PER_SAMPLE = 2; // s16le
const SEGMENT_MS = 3000;
const SEGMENT_BYTES = (SAMPLE_RATE * BYTES_PER_SAMPLE * SEGMENT_MS) / 1000; // 96,000 bytes
const SILENCE_THRESHOLD = 3; // consecutive silent/empty windows → flush utterance
const MIN_FLUSH_BYTES = SAMPLE_RATE * BYTES_PER_SAMPLE * 0.5; // 0.5s minimum

// Build a valid RIFF/WAV header around raw PCM s16le 16kHz mono data.
function writePcmWav(pcmData) {
  const wavPath = join(tmpdir(), `node-trans-${randomUUID()}.wav`);
  const dataSize = pcmData.length;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + 36, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);                        // PCM
  header.writeUInt16LE(1, 22);                        // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);
  writeFileSync(wavPath, Buffer.concat([header, pcmData]));
  return wavPath;
}

// Energy-based silence detection — avoids running Whisper on quiet segments.
function isProbablySilence(pcmData) {
  if (pcmData.length < BYTES_PER_SAMPLE) return true;
  let sumSq = 0;
  const samples = pcmData.length >> 1;
  for (let i = 0; i < samples; i++) {
    const s = pcmData.readInt16LE(i * 2);
    sumSq += s * s;
  }
  return Math.sqrt(sumSq / samples) < 300;
}

// Strip "[HH:MM:SS.mmm --> HH:MM:SS.mmm]" timestamps from whisper-cli stdout.
function parseTranscript(stdout) {
  return (stdout || "")
    .split("\n")
    .map((line) => line.replace(/^\[[\d:.]+\s*-->\s*[\d:.]+\]\s*/, "").trim())
    .filter((line) => line && !line.startsWith("["))
    .join(" ")
    .trim();
}

export function createSession({
  targetLanguage = "vi",
  whisperLanguage = "auto",
  whisperModel = "base",
  localTranslationEngine = "none",
  ollamaBaseUrl = "http://localhost:11434",
  ollamaModel = "llama3.2",
  libreTranslateUrl = "http://localhost:5000",
  languageHints = ["en"],
  context = null,
} = {}) {
  let _onPartial = null;
  let _onUtterance = null;
  let _onError = null;

  let pcmBuffer = Buffer.alloc(0);
  let utteranceAccum = "";
  let emptySegmentCount = 0;
  let inferenceRunning = false;
  let stopped = false;
  let intervalId = null;

  const translateToEnglish = targetLanguage === "en";
  const detectedLang = whisperLanguage === "auto"
    ? (languageHints[0] || "en")
    : whisperLanguage;

  const translationSettings = {
    localTranslationEngine,
    ollamaBaseUrl,
    ollamaModel,
    libreTranslateUrl,
    targetLanguage,
    context,
  };

  const whisperOptions = {
    modelName: whisperModel,
    autoDownloadModelName: whisperModel,
    removeWavFileAfterTranscription: true,
    logger: { debug: () => {}, error: console.error, log: console.log },
    whisperOptions: {
      language: whisperLanguage === "auto" ? undefined : whisperLanguage,
      translateToEnglish,
      ...(context ? { initialPrompt: context } : {}),
    },
  };

  async function getTranslation(text) {
    if (translateToEnglish) {
      // Whisper already translated; no external call needed
      return { translated: text, lang: "en" };
    }
    return translateText(text, detectedLang, translationSettings);
  }

  async function emitUtterance(text) {
    const { translated, lang } = await getTranslation(text);
    if (_onUtterance) {
      _onUtterance({
        originalText: text,
        translatedText: translated,
        originalLanguage: detectedLang,
        translationLanguage: lang || null,
        speaker: null,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async function maybeFlushUtterance() {
    if (emptySegmentCount >= SILENCE_THRESHOLD && utteranceAccum) {
      const text = utteranceAccum;
      utteranceAccum = "";
      emptySegmentCount = 0;
      await emitUtterance(text);
    }
  }

  async function runInference(pcmChunk) {
    if (inferenceRunning || stopped) return;
    if (isProbablySilence(pcmChunk)) {
      emptySegmentCount++;
      await maybeFlushUtterance();
      return;
    }

    inferenceRunning = true;
    try {
      const wavPath = writePcmWav(pcmChunk);
      const { nodewhisper } = await import("nodejs-whisper");
      const transcript = await nodewhisper(wavPath, whisperOptions);
      const text = parseTranscript(transcript);

      if (text) {
        emptySegmentCount = 0;
        const { translated } = await getTranslation(text);
        if (_onPartial) {
          _onPartial({ originalText: text, translatedText: translated, speaker: null });
        }
        utteranceAccum = utteranceAccum ? `${utteranceAccum} ${text}` : text;
      } else {
        emptySegmentCount++;
        await maybeFlushUtterance();
      }
    } catch (err) {
      if (_onError) _onError(err);
    } finally {
      inferenceRunning = false;
    }
  }

  return {
    async connect() {
      // No persistent connection needed for local inference
    },

    async startStreaming() {
      intervalId = setInterval(async () => {
        if (stopped || inferenceRunning) return;
        if (pcmBuffer.length >= SEGMENT_BYTES / 2) {
          const chunk = pcmBuffer;
          pcmBuffer = Buffer.alloc(0);
          await runInference(chunk);
        }
      }, SEGMENT_MS);
    },

    sendAudio(chunk) {
      if (!stopped) {
        pcmBuffer = Buffer.concat([pcmBuffer, chunk]);
      }
    },

    async stop() {
      stopped = true;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
      // Flush remaining buffer
      if (pcmBuffer.length >= MIN_FLUSH_BYTES) {
        const remaining = pcmBuffer;
        pcmBuffer = Buffer.alloc(0);
        await runInference(remaining);
      }
      // Force-emit any accumulated text as final utterance
      if (utteranceAccum) {
        const text = utteranceAccum;
        utteranceAccum = "";
        await emitUtterance(text);
      }
    },

    onPartial(callback) { _onPartial = callback; },
    onUtterance(callback) { _onUtterance = callback; },
    onError(callback) { _onError = callback; },
  };
}
