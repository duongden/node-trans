import { spawn } from "child_process";
import { Transform } from "stream";

const CHUNK_SIZE = 3840; // 120ms at 16kHz mono 16-bit

class ChunkTransform extends Transform {
  constructor() {
    super();
    this.pending = Buffer.alloc(0);
  }

  _transform(data, encoding, callback) {
    this.pending = Buffer.concat([this.pending, data]);
    while (this.pending.length >= CHUNK_SIZE) {
      this.push(this.pending.subarray(0, CHUNK_SIZE));
      this.pending = this.pending.subarray(CHUNK_SIZE);
    }
    callback();
  }

  _flush(callback) {
    if (this.pending.length > 0) {
      this.push(this.pending);
    }
    callback();
  }
}

export function startCapture(deviceIndex) {
  const ffmpeg = spawn("ffmpeg", [
    "-f", "avfoundation",
    "-i", `:${deviceIndex}`,
    "-acodec", "pcm_s16le",
    "-ar", "16000",
    "-ac", "1",
    "-f", "s16le",
    "pipe:1",
  ], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let paused = false;

  // Gate: when paused, drop audio data (ffmpeg keeps running but Soniox gets nothing)
  const gate = new Transform({
    transform(chunk, enc, cb) {
      if (!paused) this.push(chunk);
      cb();
    },
  });

  const chunker = new ChunkTransform();
  ffmpeg.stdout.pipe(gate).pipe(chunker);

  // Suppress ffmpeg stderr noise
  ffmpeg.stderr.on("data", () => {});

  return {
    stream: chunker,
    process: ffmpeg,

    pause() {
      paused = true;
    },

    resume() {
      paused = false;
    },

    stop() {
      ffmpeg.kill("SIGTERM");
    },

    onError(callback) {
      ffmpeg.on("error", callback);
      ffmpeg.on("exit", (code) => {
        if (code && code !== 0 && code !== 255) {
          callback(new Error(`ffmpeg exited with code ${code}`));
        }
      });
    },
  };
}
