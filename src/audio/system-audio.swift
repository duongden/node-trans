import ScreenCaptureKit
import CoreMedia
import Foundation

class SystemAudioCapturer: NSObject, SCStreamOutput, SCStreamDelegate {
    private var stream: SCStream?
    private let sampleRate: Double = 16000
    private let stdout = FileHandle.standardOutput

    func start() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: false)
        guard let display = content.displays.first else {
            fputs("Error: No display found\n", stderr)
            Foundation.exit(1)
        }

        let filter = SCContentFilter(display: display, excludingWindows: [])
        let config = SCStreamConfiguration()

        // Audio config
        config.capturesAudio = true
        config.excludesCurrentProcessAudio = true
        config.sampleRate = Int(sampleRate)
        config.channelCount = 1

        // Minimize video overhead (required but we discard it)
        config.width = 2
        config.height = 2
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1)

        stream = SCStream(filter: filter, configuration: config, delegate: self)

        let queue = DispatchQueue(label: "audio-capture", qos: .userInteractive)
        try stream!.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        try await stream!.startCapture()

        fputs("System audio capture started\n", stderr)
    }

    func stop() async {
        try? await stream?.stopCapture()
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        guard sampleBuffer.isValid, sampleBuffer.numSamples > 0 else { return }

        // Get audio buffer list
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else { return }

        var length = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        let status = CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: nil, totalLengthOut: &length, dataPointerOut: &dataPointer)

        guard status == kCMBlockBufferNoErr, let ptr = dataPointer, length > 0 else { return }

        // ScreenCaptureKit outputs Float32 PCM — convert to Int16 (S16LE)
        let floatCount = length / MemoryLayout<Float32>.size
        let floatPtr = UnsafeRawPointer(ptr).bindMemory(to: Float32.self, capacity: floatCount)

        var int16Buffer = [Int16](repeating: 0, count: floatCount)
        for i in 0..<floatCount {
            let sample = max(-1.0, min(1.0, floatPtr[i]))
            int16Buffer[i] = Int16(sample * Float32(Int16.max))
        }

        int16Buffer.withUnsafeBufferPointer { bufferPtr in
            let data = Data(buffer: bufferPtr)
            stdout.write(data)
        }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        fputs("Stream error: \(error.localizedDescription)\n", stderr)
        Foundation.exit(1)
    }
}

// Handle SIGTERM/SIGINT for graceful shutdown
let capturer = SystemAudioCapturer()

signal(SIGTERM) { _ in
    fputs("Stopping capture...\n", stderr)
    Foundation.exit(0)
}

signal(SIGINT) { _ in
    fputs("Stopping capture...\n", stderr)
    Foundation.exit(0)
}

// Main
Task {
    do {
        try await capturer.start()
    } catch {
        fputs("Failed to start: \(error.localizedDescription)\n", stderr)
        Foundation.exit(1)
    }
}

RunLoop.main.run()
