/**
 * Pre-builds whisper.cpp so users don't have to wait on first transcription.
 * nodejs-whisper auto-builds on first use, but this script lets you do it
 * ahead of time: npm run whisper:build
 */

import { execSync } from "child_process";
import { existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const whisperCppPath = join(__dirname, "../node_modules/nodejs-whisper/cpp/whisper.cpp");

if (!existsSync(whisperCppPath)) {
  console.error("nodejs-whisper not found. Run: npm install");
  process.exit(1);
}

console.log("Building whisper.cpp...");
console.log(`Path: ${whisperCppPath}`);

try {
  execSync("cmake -B build", { cwd: whisperCppPath, stdio: "inherit" });
  execSync("cmake --build build --config Release", { cwd: whisperCppPath, stdio: "inherit" });
  console.log("\nwhisper.cpp built successfully.");
  console.log("Next: download a model via the nodejs-whisper auto-download (starts on first transcription).");
} catch (err) {
  console.error("\nBuild failed. Make sure cmake is installed:");
  console.error("  macOS: brew install cmake");
  console.error("  Windows: https://cmake.org/download/");
  process.exit(1);
}
