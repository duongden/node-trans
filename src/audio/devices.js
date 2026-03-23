import { spawn, execFile } from "child_process";

// Input devices (for ffmpeg avfoundation capture) — used for mic & system audio capture
export async function listInputDevices() {
  return new Promise((resolve) => {
    const ffmpeg = spawn("ffmpeg", [
      "-f", "avfoundation",
      "-list_devices", "true",
      "-i", "",
    ]);

    let stderr = "";
    ffmpeg.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    ffmpeg.on("close", () => {
      resolve(parseAvfoundation(stderr));
    });
  });
}

const TRANSPORT_LABELS = {
  coreaudio_device_type_bluetooth: "Bluetooth",
  coreaudio_device_type_builtin: "Built-in",
  coreaudio_device_type_hdmi: "HDMI",
  coreaudio_device_type_usb: "USB",
  coreaudio_device_type_virtual: "Virtual",
  coreaudio_device_type_unknown: "Aggregate",
};

// Output devices (speakers, headphones, virtual outputs) — for system audio setting display
export async function listOutputDevices() {
  return new Promise((resolve, reject) => {
    execFile("system_profiler", ["SPAudioDataType", "-json"], (err, stdout) => {
      if (err) return resolve([]);
      try {
        const data = JSON.parse(stdout);
        const items = data.SPAudioDataType?.[0]?._items || [];
        const outputs = items
          .filter((d) => d.coreaudio_device_output)
          .map((d) => ({
            name: d._name,
            transport: TRANSPORT_LABELS[d.coreaudio_device_transport] || "",
            isDefault: !!d.coreaudio_default_audio_output_device,
          }));
        resolve(outputs);
      } catch {
        resolve([]);
      }
    });
  });
}

// Combined: returns { input: [...], output: [...] }
export async function listAllDevices() {
  const [input, output] = await Promise.all([listInputDevices(), listOutputDevices()]);
  return { input, output };
}

function parseAvfoundation(stderr) {
  const lines = stderr.split("\n");
  const devices = [];
  let inAudioSection = false;

  for (const line of lines) {
    if (line.includes("AVFoundation audio devices:")) {
      inAudioSection = true;
      continue;
    }
    if (inAudioSection && line.includes("AVFoundation") && !line.match(/\]\s+\[\d+\]/)) {
      break;
    }
    if (inAudioSection) {
      const match = line.match(/\]\s+\[(\d+)\]\s+(.+)/);
      if (match) {
        devices.push({
          index: parseInt(match[1]),
          name: match[2].trim(),
        });
      }
    }
  }

  return devices;
}
