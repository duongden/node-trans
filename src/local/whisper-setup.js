/**
 * Whisper Python environment setup.
 *
 * Creates ~/.node-trans/whisper-venv with openai-whisper (if not already
 * available via diarize-venv), then downloads the selected model with
 * progress reporting.
 *
 * onEvent is called with:
 *   { line: "text" }                                 -- log line
 *   { progress: 45, downloaded: 67.2, total: 149.4 } -- download progress (MB)
 *   { progress: 100, done: true }                    -- download complete
 */

import { spawn, execSync } from "child_process";
import { mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const isWin = process.platform === "win32";

const SHARED_VENV  = join(os.homedir(), ".node-trans", "venv");
// Legacy paths — kept only for detection of existing installations
const DIARIZE_VENV = join(os.homedir(), ".node-trans", "diarize-venv");
const WHISPER_VENV = join(os.homedir(), ".node-trans", "whisper-venv");

function venvPython(venvDir) {
  return join(venvDir, isWin ? "Scripts\\python.exe" : "bin/python3");
}

/** Returns the Python bin that already has openai-whisper, or null. */
function findExistingWhisperPython() {
  for (const venv of [SHARED_VENV, DIARIZE_VENV, WHISPER_VENV]) {
    const py = venvPython(venv);
    if (existsSync(py)) {
      try {
        execSync(`"${py}" -c "import whisper"`, { timeout: 10_000, stdio: "ignore" });
        return py;
      } catch {}
    }
  }
  return null;
}

function findSystemPython() {
  if (process.env.DIARIZE_PYTHON) return process.env.DIARIZE_PYTHON;
  const candidates = isWin
    ? ["py", "python3.12", "python3.11", "python3", "python"]
    : [
        "/opt/homebrew/opt/python@3.12/bin/python3.12",
        "/opt/homebrew/opt/python@3.11/bin/python3.11",
        "python3.12",
        "python3.11",
        "python3",
      ];
  for (const bin of candidates) {
    try {
      const out = execSync(`"${bin}" --version 2>&1`).toString().trim();
      const m = out.match(/Python (\d+)\.(\d+)/);
      if (m && Number(m[1]) === 3 && Number(m[2]) >= 10) return bin;
    } catch {}
  }
  return isWin ? "py" : "python3";
}

/** Spawn a command, line-buffering stdout+stderr into onLine. */
function spawnLines(cmd, args, onLine, env) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env: env || process.env });
    let buf = "";
    const feed = (chunk) => {
      buf += chunk.toString();
      const parts = buf.split("\n");
      buf = parts.pop();
      for (const l of parts) if (l.trim()) onLine(l);
    };
    proc.stdout.on("data", feed);
    proc.stderr.on("data", feed);
    proc.on("close", (code) => {
      if (buf.trim()) onLine(buf);
      if (code === 0) resolve();
      else reject(new Error(`Exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

/**
 * Ensures a Python env with openai-whisper is available.
 * Returns the path to the Python binary.
 */
async function ensureWhisperEnv(onEvent) {
  // Fast path: environment already has whisper
  const existing = findExistingWhisperPython();
  if (existing) {
    onEvent({ line: `✓ Using existing Python environment: ${existing}` });
    return existing;
  }

  const sysPy = findSystemPython();
  onEvent({ line: `Using system Python: ${sysPy}` });

  let version;
  try {
    version = execSync(`"${sysPy}" --version 2>&1`).toString().trim();
  } catch {
    throw new Error(`Python not found: ${sysPy}. Install Python 3.10+ and try again.`);
  }
  onEvent({ line: `Found ${version}` });

  onEvent({ line: `\n> Creating virtual environment at: ${SHARED_VENV}` });
  mkdirSync(join(os.homedir(), ".node-trans"), { recursive: true });
  await spawnLines(sysPy, ["-m", "venv", SHARED_VENV], (l) => onEvent({ line: l }));

  const venvPy = venvPython(SHARED_VENV);

  onEvent({ line: "\n> Upgrading pip..." });
  await spawnLines(venvPy, ["-m", "pip", "install", "--upgrade", "pip", "--quiet"],
    (l) => onEvent({ line: l }));

  onEvent({ line: "\n> Installing openai-whisper (includes PyTorch — may take 5–15 min)..." });
  await spawnLines(venvPy, ["-m", "pip", "install", "openai-whisper", "--quiet"],
    (l) => onEvent({ line: l }));

  onEvent({ line: "\n> Verifying installation..." });
  await spawnLines(venvPy, ["-c", "import whisper; print('openai-whisper OK')"],
    (l) => onEvent({ line: l }));

  return venvPy;
}

/**
 * Downloads the model using whisper-download.py, emitting progress events.
 * Separates stdout (JSON progress) from stderr (diagnostic text).
 */
function downloadModel(pythonBin, modelName, onEvent) {
  const scriptPath = join(__dirname, "whisper-download.py");
  // In Electron ASAR packaging, source files are virtual — use unpacked path.
  const unpacked = scriptPath.replace(/app\.asar([/\\])/g, "app.asar.unpacked$1");
  const script = existsSync(unpacked) ? unpacked : scriptPath;

  return new Promise((resolve, reject) => {
    const proc = spawn(pythonBin, [script, modelName], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdoutBuf = "";

    proc.stdout.on("data", (data) => {
      stdoutBuf += data.toString("utf8");
      const lines = stdoutBuf.split("\n");
      stdoutBuf = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.error) { reject(new Error(msg.error)); return; }
          onEvent(msg); // { progress, downloaded, total } or { progress, done }
        } catch {
          onEvent({ line }); // non-JSON line → treat as log
        }
      }
    });

    // stderr is diagnostic, show as log lines
    let stderrBuf = "";
    proc.stderr.on("data", (data) => {
      stderrBuf += data.toString("utf8");
      const lines = stderrBuf.split("\n");
      stderrBuf = lines.pop();
      for (const l of lines) if (l.trim()) onEvent({ line: l });
    });

    proc.on("close", (code) => {
      if (stderrBuf.trim()) onEvent({ line: stderrBuf });
      if (code === 0) resolve();
      else reject(new Error(`Download script exited with code ${code}`));
    });

    proc.on("error", reject);
  });
}

export async function runWhisperSetup(modelName, onEvent) {
  const pythonBin = await ensureWhisperEnv(onEvent);
  onEvent({ line: `\n> Downloading Whisper model: ${modelName}` });
  await downloadModel(pythonBin, modelName, onEvent);
}

/** Returns the Python binary that has openai-whisper, or null if not set up. */
export function getWhisperPython() {
  return findExistingWhisperPython();
}

/** Returns true if the model .pt file exists in the whisper cache. */
export function isModelDownloaded(modelName) {
  const cacheDir = join(os.homedir(), ".cache", "whisper");
  // openai-whisper stores models as <name>.pt
  return existsSync(join(cacheDir, `${modelName}.pt`));
}
