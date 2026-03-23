# Node Trans

[Tiếng Việt](README.md)

Real-time audio translation app powered by the [Soniox API](https://soniox.com/docs/stt/rt/real-time-translation). Captures audio from microphone, system audio, or both, translates to a target language, and saves conversation history.

## Requirements

- **Node.js** >= 18
- **ffmpeg** (`brew install ffmpeg`)
- **Soniox API Key** (sign up at [soniox.com](https://soniox.com))
- **BlackHole 2ch** (only required for system audio capture)

## Installation

```bash
# Install dependencies
npm install

# Create .env file
echo "SONIOX_API_KEY=your_api_key_here" > .env
```

### BlackHole Setup (for System Audio)

```bash
brew install blackhole-2ch
# Restart your Mac after installation
```

After installing BlackHole, create an **Aggregate Device** in Audio MIDI Setup:

1. Open **Audio MIDI Setup** (Spotlight → "Audio MIDI Setup")
2. Click **"+"** at the bottom left → **Create Aggregate Device**
3. Check **BlackHole 2ch** + **your speaker** (e.g. MacBook Pro Speakers)
4. Go to **System Settings → Sound → Output** → select the Aggregate Device

System audio will be routed through both your speaker and BlackHole. The app auto-detects BlackHole for capture.

## Running

```bash
# Production
npm start

# Development (auto-reload)
npm run dev
```

Open your browser at `http://localhost:3000`

## Usage

### Live Translation Tab

- Press **▶ Start** to begin listening and translating
- **⏸ Pause** — pause capture while keeping the session
- **▶ Resume** — continue capture in the same session
- **⊕ New Meeting** — end current session and start a new one
- **⏹ Stop** — end the session

Each speaker is distinguished by a unique color. Original text and translations are displayed in real-time.

### History Tab

- Lists all saved sessions with timestamps, duration, source, utterance count, and speaker count
- **Click** a session to view details
- **Long press** to enter multi-select mode → bulk delete
- In session detail:
  - **Rename session** via the 🖊️ button next to the title
  - **Rename speakers** (e.g. "Speaker 1" → "John") via the 🖊️ button in the speaker list
  - **Export to Markdown** to save the conversation as a `.md` file

### Settings Tab

| Setting | Description |
|---------|-------------|
| Audio source | Microphone / System Audio / Both |
| Mic device | Select microphone (from input device list) |
| Target language | Translation language (default: Vietnamese) |

System audio automatically detects BlackHole — no additional configuration needed.

## Project Structure

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
│   │   └── devices.js # List input/output audio devices
│   ├── soniox/
│   │   └── session.js # Soniox real-time translation session
│   ├── storage/
│   │   ├── history.js # SQLite DB (sessions, utterances, speaker aliases)
│   │   ├── settings.js# Settings storage (~/.node-trans/settings.json)
│   │   └── export.js  # Export session to Markdown
│   └── routes/
│       └── api.js     # REST API endpoints
├── .env               # SONIOX_API_KEY
└── package.json
```

## Data Storage

Data is stored at `~/.node-trans/`:

- `settings.json` — application settings
- `history.db` — SQLite database containing conversation history

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/devices` | List audio devices |
| GET | `/api/settings` | Read settings |
| PUT | `/api/settings` | Save settings |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Session detail + utterances |
| PATCH | `/api/sessions/:id` | Rename session |
| DELETE | `/api/sessions/:id` | Delete session |
| PUT | `/api/sessions/:id/speakers/:speaker` | Rename speaker |
| GET | `/api/sessions/:id/export` | Export as Markdown |

## Socket.IO Events

| Event (Client → Server) | Description |
|--------------------------|-------------|
| `start-listening` | Start capture + translation |
| `pause-listening` | Pause capture |
| `resume-listening` | Resume capture |
| `stop-listening` | Stop capture |

| Event (Server → Client) | Description |
|--------------------------|-------------|
| `status` | Status update (listening, paused, audioSource) |
| `utterance` | Complete utterance (original + translation) |
| `partial-result` | Partial/interim result |
| `error` | Error message |
