# node-trans — Luồng xử lý & Kiến trúc

## Tổng quan

Ứng dụng dịch âm thanh real-time. Thu âm từ mic hoặc system audio, phiên âm (STT), dịch thuật, và lưu lịch sử. Chạy dưới dạng web app hoặc Electron desktop app.

---

## Luồng xử lý chính

```
Thiết bị âm thanh (mic / system)
        │
        ▼
   FFmpeg process
   PCM s16le · 16kHz · mono
        │
        ▼
  capture.js (ChunkTransform)
  Chuẩn hóa thành chunks 120ms (3.840 bytes)
        │
        ├─────────────────────────────────────────────┐
        ▼                                             ▼
  [Engine: Soniox]                        [Engine: Local Whisper]
  soniox/session.js                       whisper-session.js / diarize-session.js
        │                                             │
        ▼                                             ▼
  Soniox Cloud API                   whisper.cpp (via nodejs-whisper)
  · Phiên âm real-time               · Buffer 3s, silence detection
  · Dịch thuật (cloud)               · Xuất text + timestamps
  · Nhận diện người nói (cloud)      · Dịch qua Ollama / LibreTranslate (nếu bật)
        │                                             │
        │                              ┌──────────────┴──────────────┐
        │                              ▼                             ▼
        │                    [Không có diarization]    [Có HF Token → Diarization]
        │                    speaker: null              diarize-session.js
        │                                                     │
        │                                                     ▼
        │                                              diarize.py (Python subprocess)
        │                                              · openai-whisper (CPU)
        │                                              · pyannote/speaker-diarization-3.1 (MPS/CUDA)
        │                                              · Cửa sổ 10s, stride 5s
        │                                              · speaker: SPEAKER_00, SPEAKER_01...
        │                                              [Fallback nếu Python lỗi → whisper-session]
        │
        ▼
   Socket.IO (server.js)
   emit: "utterance", "partial-result"
        │
        ├──────────────────────────────┐
        ▼                             ▼
   React UI (browser)          Overlay window (Electron)
   · Hiển thị transcript       · Always-on-top
   · Màu theo speaker          · Trong suốt, frameless
   · Lịch sử session
        │
        ▼
   SQLite (history.db)
   · Sessions + Utterances + Speaker aliases
```

---

## Các thành phần

### Backend (`src/`)

| File | Vai trò |
|------|---------|
| `server.js` | Express + Socket.IO. Quản lý sessions, điều phối audio capture và STT |
| `audio/capture.js` | Spawn FFmpeg, chuẩn hóa PCM thành 120ms chunks, hỗ trợ pause/resume |
| `audio/devices.js` | Liệt kê thiết bị âm thanh (parse ffmpeg output) |
| `soniox/session.js` | Wrapper Soniox SDK real-time. Phiên âm + dịch + diarization qua cloud |
| `local/whisper-session.js` | STT offline. Buffer 3s, silence detection, gọi whisper.cpp |
| `local/diarize-session.js` | Wrapper Python subprocess. Gửi audio qua stdin, nhận utterances qua stdout. Fallback về whisper-session nếu lỗi |
| `local/diarize.py` | Python worker: pyannote + openai-whisper. Nhận base64 PCM, trả JSON utterances với speaker labels |
| `local/translate.js` | Gọi Ollama hoặc LibreTranslate. Non-fatal: lỗi trả về empty string |
| `storage/history.js` | SQLite (better-sqlite3). CRUD sessions, utterances, speaker aliases |
| `storage/settings.js` | Đọc/ghi `settings.json`. Load đồng bộ |
| `routes/api.js` | REST API: settings, sessions, devices, local status |

### Frontend (`client/src/`)

| File | Vai trò |
|------|---------|
| `context/SocketContext.jsx` | State trung tâm (useReducer). Kết nối Socket.IO, quản lý utterances, speaker colors, session selection |
| `components/live/` | UI real-time: controls, transcript, utterance rendering |
| `components/history/` | Duyệt lịch sử, xem chi tiết, đổi tên speaker, export |
| `components/settings/` | Form cài đặt: engine, audio, translation, diarization, overlay |
| `i18n/` | Đa ngôn ngữ EN/VI. `t()` function từ I18nContext |

### Electron (`electron/`)

| File | Vai trò |
|------|---------|
| `main.js` | Start Express server nội bộ → load app URL. Quản lý main window + overlay window. IPC bridge |
| `preload.js` | Expose `window.electronAPI` cho renderer (IPC an toàn) |

---

## Hai engine STT

### Soniox (Cloud)

```
Audio chunks → Soniox SDK → Cloud API
                              · Model: stt-rt-v4
                              · Real-time streaming
                              · Tự động dịch
                              · Speaker diarization built-in
```

Ưu điểm: độ trễ thấp, chất lượng cao, không cần setup.
Nhược điểm: cần API key, cần internet.

### Local Whisper (Offline)

```
Audio chunks → Buffer 3s → whisper.cpp (C++ binary)
                                  · Phiên âm text
                                  · Có/không có timestamps
                 [nếu có HF token]
                 → diarize.py (Python subprocess)
                       · pyannote: ai đang nói?
                       · openai-whisper: nói gì?
                       · Kết hợp → utterance + speaker
```

Ưu điểm: offline hoàn toàn, miễn phí.
Nhược điểm: cần build whisper.cpp, cần setup Python cho diarization.

---

## Giao tiếp Node.js ↔ Python (Diarization)

Protocol: newline-delimited JSON qua stdin/stdout

```
Node → Python:
  {"type": "audio",    "data": "<base64 PCM>"}
  {"type": "flush"}
  {"type": "shutdown"}

Python → Node:
  {"type": "ready"}
  {"type": "utterance", "text": "...", "speaker": "SPEAKER_00", "start": 0.5, "end": 3.2}
  {"type": "error",    "message": "..."}
```

Python worker khởi động 1 lần/session (tránh reload model). Timeout 120s chờ `ready`. Nếu quá thời gian hoặc crash → tự động fallback sang whisper-session (speaker: null).

---

## Cơ sở dữ liệu (SQLite)

Đường dẫn: `~/.node-trans/history.db` (web) hoặc `userData/data/history.db` (Electron)

```sql
sessions      -- id, title, started_at, ended_at, audio_source, target_language, device_name, context
utterances    -- id, session_id, timestamp, speaker, original_text, original_language,
              --    translated_text, translation_language, source
speaker_aliases -- session_id, speaker ("SPEAKER_00"), alias (tên người dùng đặt)
```

---

## Cài đặt & File cấu hình

| File | Vị trí |
|------|--------|
| `settings.json` | `~/.node-trans/settings.json` |
| `history.db` | `~/.node-trans/history.db` |
| `diarize-venv` | `~/.node-trans/diarize-venv/` (Python venv) |

Các trường cấu hình chính:

```
audioSource           mic / system / both
transcriptionEngine   soniox / local-whisper
whisperModel          tiny / base / small / medium / large-v3-turbo / large
whisperLanguage       auto / en / vi / ...
localTranslationEngine  none / ollama / libretranslate
ollamaModel           gemma3:4b / llama3.2 / ...
hfToken               Hugging Face READ token (cho diarization)
targetLanguage        vi / en / ja / ...
```

---

## Luồng session

```
User nhấn "Start"
    │
    ▼
Socket emit "start-listening" { sessionId?, context? }
    │
    ├── sessionId có? → Reopen session từ DB (giữ nguyên audio source, language, context)
    └── sessionId không có? → Tạo session mới
    │
    ▼
Resolve thiết bị âm thanh
    · Mic: theo setting hoặc device index 0
    · System: theo setting hoặc auto-detect BlackHole (macOS) / VB-CABLE (Windows)
    │
    ▼
Tạo STT session (1 hoặc 2 nếu audioSource = "both")
    │
    ▼
Bắt đầu stream audio → STT
    │
    ├── onPartial → socket.emit("partial-result") → UI hiển thị text đang nhận
    └── onUtterance → DB.addUtterance() + socket.emit("utterance") → UI + Overlay
    │
User nhấn "Stop"
    │
    ▼
stopSession: dừng FFmpeg, dừng STT, DB.endSession()
```

---

## Yêu cầu hệ thống

| Thành phần | Bắt buộc | Ghi chú |
|------------|----------|---------|
| ffmpeg | ✅ | Thu âm |
| Node.js 18+ | ✅ | Runtime |
| whisper.cpp | Chỉ khi dùng Local Whisper | `npm run whisper:build` |
| Python 3.11 | Chỉ khi dùng Diarization | `npm run diarize:setup` |
| Ollama | Chỉ khi dùng Ollama translation | `ollama serve` phải chạy |
| LibreTranslate | Chỉ khi dùng LibreTranslate | Server phải chạy |
| BlackHole (macOS) | Chỉ khi thu system audio | Hoặc chỉ định device thủ công |
| Soniox API Key | Chỉ khi dùng Soniox | cloud.soniox.com |
| HuggingFace Token | Chỉ khi dùng Diarization | huggingface.co/settings/tokens |
