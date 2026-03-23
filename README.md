# Node Trans

[English](README.en.md)

Ứng dụng dịch âm thanh thời gian thực sử dụng [Soniox API](https://soniox.com/docs/stt/rt/real-time-translation). Hỗ trợ nghe từ microphone, system audio hoặc cả hai, dịch sang ngôn ngữ đích và lưu lịch sử hội thoại.

## Yêu cầu

- **Node.js** >= 18
- **ffmpeg** (cài qua `brew install ffmpeg`)
- **Soniox API Key** (đăng ký tại [soniox.com](https://soniox.com))
- **BlackHole 2ch** (chỉ cần nếu muốn capture system audio)

## Cài đặt

```bash
# Clone và cài dependencies
npm install

# Tạo file .env
echo "SONIOX_API_KEY=your_api_key_here" > .env
```

### Cài BlackHole (cho System Audio)

```bash
brew install blackhole-2ch
# Restart máy sau khi cài
```

Sau khi cài BlackHole, tạo **Aggregate Device** trong Audio MIDI Setup:

1. Mở **Audio MIDI Setup** (Spotlight → "Audio MIDI Setup")
2. Nhấn **"+"** ở góc trái dưới → **Create Aggregate Device**
3. Tick **BlackHole 2ch** + **loa đang dùng** (ví dụ MacBook Pro Speakers)
4. Vào **System Settings → Sound → Output** → chọn Aggregate Device vừa tạo

Âm thanh hệ thống sẽ được route qua cả loa và BlackHole, app tự detect BlackHole để capture.

## Chạy

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Mở trình duyệt tại `http://localhost:3000`

## Sử dụng

### Tab Dịch trực tiếp

- Nhấn **▶ Bắt đầu** để bắt đầu nghe và dịch
- **⏸ Tạm dừng** — tạm dừng capture, giữ nguyên session
- **▶ Tiếp tục** — tiếp tục capture trong cùng session
- **⊕ Cuộc họp mới** — kết thúc session hiện tại, bắt đầu session mới
- **⏹ Dừng** — kết thúc session

Mỗi speaker được phân biệt bằng màu sắc riêng. Nội dung gốc và bản dịch hiển thị realtime.

### Tab Lịch sử

- Danh sách các session đã lưu, hiển thị thời gian, thời lượng, nguồn, số câu, số người nói
- **Click** vào session để xem chi tiết
- **Nhấn giữ** (long press) để vào chế độ chọn nhiều → xóa hàng loạt
- Trong chi tiết session:
  - **Đổi tên session** bằng nút 🖊️ cạnh title
  - **Đổi tên speaker** (ví dụ "Speaker 1" → "Anh Nam") bằng nút 🖊️ trong danh sách người nói
  - **Xuất Markdown** để lưu nội dung ra file `.md`

### Tab Cài đặt

| Cài đặt | Mô tả |
|---------|-------|
| Nguồn âm thanh | Microphone / System Audio / Cả hai |
| Thiết bị mic | Chọn microphone (từ danh sách input devices) |
| Ngôn ngữ đích | Ngôn ngữ dịch (mặc định: Tiếng Việt) |

System audio tự động detect BlackHole, không cần cấu hình thêm.

## Cấu trúc project

```
node-trans/
├── public/            # Frontend (vanilla HTML/CSS/JS)
│   ├── index.html
│   ├── app.js
│   └── style.css
├── src/
│   ├── server.js      # Express + Socket.IO server
│   ├── audio/
│   │   ├── capture.js # ffmpeg audio capture (pause/resume)
│   │   └── devices.js # Liệt kê input/output devices
│   ├── soniox/
│   │   └── session.js # Soniox realtime translation session
│   ├── storage/
│   │   ├── history.js # SQLite DB (sessions, utterances, speaker aliases)
│   │   ├── settings.js# Lưu settings (~/.node-trans/settings.json)
│   │   └── export.js  # Xuất session ra Markdown
│   └── routes/
│       └── api.js     # REST API endpoints
├── .env               # SONIOX_API_KEY
└── package.json
```

## Dữ liệu

Dữ liệu được lưu tại `~/.node-trans/`:

- `settings.json` — cài đặt ứng dụng
- `history.db` — SQLite database chứa lịch sử hội thoại

## API Endpoints

| Method | Endpoint | Mô tả |
|--------|----------|-------|
| GET | `/api/devices` | Danh sách audio devices |
| GET | `/api/settings` | Đọc settings |
| PUT | `/api/settings` | Lưu settings |
| GET | `/api/sessions` | Danh sách sessions |
| GET | `/api/sessions/:id` | Chi tiết session + utterances |
| PATCH | `/api/sessions/:id` | Đổi tên session |
| DELETE | `/api/sessions/:id` | Xóa session |
| PUT | `/api/sessions/:id/speakers/:speaker` | Đổi tên speaker |
| GET | `/api/sessions/:id/export` | Xuất Markdown |

## Socket.IO Events

| Event (Client → Server) | Mô tả |
|--------------------------|-------|
| `start-listening` | Bắt đầu capture + dịch |
| `pause-listening` | Tạm dừng |
| `resume-listening` | Tiếp tục |
| `stop-listening` | Dừng |

| Event (Server → Client) | Mô tả |
|--------------------------|-------|
| `status` | Trạng thái (listening, paused, audioSource) |
| `utterance` | Câu hoàn chỉnh (original + translation) |
| `partial-result` | Kết quả tạm thời |
| `error` | Lỗi |
