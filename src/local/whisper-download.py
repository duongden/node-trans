#!/usr/bin/env python3
"""
Download a Whisper model to ~/.cache/whisper/ with JSON progress reporting.

Usage: python whisper-download.py <model-name>

Output (stdout, newline-delimited JSON):
  {"progress": 45, "downloaded": 67.2, "total": 149.4}   -- during download
  {"progress": 100, "done": true}                         -- when complete
  {"error": "..."}                                        -- on failure
"""

import sys
import os
import json
import hashlib
import urllib.request


def emit(obj):
    sys.stdout.write(json.dumps(obj) + "\n")
    sys.stdout.flush()


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    if len(sys.argv) < 2:
        emit({"error": "Usage: whisper-download.py <model-name>"})
        sys.exit(1)

    model_name = sys.argv[1]

    try:
        import whisper
    except ImportError:
        emit({"error": "openai-whisper is not installed in this Python environment"})
        sys.exit(1)

    models = getattr(whisper, "_MODELS", None)
    if models is None or model_name not in models:
        emit({"error": f"Unknown model: '{model_name}'. Available: {list((models or {}).keys())}"})
        sys.exit(1)

    url = models[model_name]
    # URL structure: .../models/<sha256>/<filename>
    expected_sha256 = url.split("/")[-2]
    filename = os.path.basename(url)

    cache_dir = os.path.join(os.path.expanduser("~"), ".cache", "whisper")
    os.makedirs(cache_dir, exist_ok=True)
    download_target = os.path.join(cache_dir, filename)

    # Check if already downloaded and valid
    if os.path.exists(download_target):
        print(f"[whisper-download] Verifying existing file...", file=sys.stderr, flush=True)
        if sha256_file(download_target) == expected_sha256:
            emit({"progress": 100, "done": True})
            return
        print(f"[whisper-download] Checksum mismatch, re-downloading...", file=sys.stderr, flush=True)
        os.remove(download_target)

    print(f"[whisper-download] Downloading {model_name} from {url}", file=sys.stderr, flush=True)

    last_pct = -1

    def reporthook(count, block_size, total_size):
        nonlocal last_pct
        if total_size <= 0:
            return
        downloaded_bytes = count * block_size
        pct = min(100, int(downloaded_bytes * 100 / total_size))
        if pct != last_pct:
            last_pct = pct
            emit({
                "progress": pct,
                "downloaded": round(downloaded_bytes / (1024 * 1024), 1),
                "total": round(total_size / (1024 * 1024), 1),
            })

    try:
        urllib.request.urlretrieve(url, download_target, reporthook)
    except Exception as e:
        if os.path.exists(download_target):
            os.remove(download_target)
        emit({"error": f"Download failed: {e}"})
        sys.exit(1)

    # Verify checksum
    print("[whisper-download] Verifying checksum...", file=sys.stderr, flush=True)
    if sha256_file(download_target) != expected_sha256:
        os.remove(download_target)
        emit({"error": "Checksum verification failed — file may be corrupt. Try again."})
        sys.exit(1)

    emit({"progress": 100, "done": True})


if __name__ == "__main__":
    main()
