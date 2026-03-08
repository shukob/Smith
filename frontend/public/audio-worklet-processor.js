/**
 * AudioWorkletProcessor for capturing microphone audio as PCM16 16kHz mono.
 *
 * The browser's AudioContext typically captures at 48kHz.
 * This processor downsamples to 16kHz and converts Float32 → Int16 PCM.
 */
class PCM16CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    // Send audio chunks every ~100ms (1600 samples at 16kHz = 3200 bytes)
    this._chunkSize = 1600;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const inputData = input[0]; // Float32Array at sampleRate (usually 48kHz)

    // Downsample from sampleRate to 16kHz
    const ratio = sampleRate / 16000;
    for (let i = 0; i < inputData.length; i += ratio) {
      const idx = Math.floor(i);
      if (idx < inputData.length) {
        // Clamp and convert Float32 [-1, 1] → Int16 [-32768, 32767]
        const sample = Math.max(-1, Math.min(1, inputData[idx]));
        this._buffer.push(sample * 0x7fff);
      }
    }

    // Send chunk when buffer is full
    if (this._buffer.length >= this._chunkSize) {
      const pcm16 = new Int16Array(this._buffer.splice(0, this._chunkSize));
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }

    return true;
  }
}

registerProcessor("pcm16-capture-processor", PCM16CaptureProcessor);
