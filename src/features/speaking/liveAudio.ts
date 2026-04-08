const LIVE_INPUT_RATE = 16_000;
const LIVE_OUTPUT_RATE = 24_000;

function getAudioContextCtor(): typeof AudioContext {
  const w = window as typeof window & {
    webkitAudioContext?: typeof AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? AudioContext;
}

function mergeFloat(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(a.length + b.length);
  out.set(a);
  out.set(b, a.length);
  return out;
}

/** Downsample mic Float32 to 16 kHz using linear interpolation. */
class FloatTo16kResampler {
  private readonly ratio: number;
  private buffer = new Float32Array(0);

  constructor(inputRate: number) {
    this.ratio = inputRate / LIVE_INPUT_RATE;
  }

  push(chunk: Float32Array): Float32Array {
    const merged = mergeFloat(this.buffer, chunk);
    if (this.ratio === 1) {
      this.buffer = new Float32Array(0);
      return merged;
    }
    const out: number[] = [];
    let j = 0;
    while (true) {
      const srcPos = j * this.ratio;
      const i0 = Math.floor(srcPos);
      if (i0 + 1 >= merged.length) break;
      const t = srcPos - i0;
      out.push(merged[i0] * (1 - t) + merged[i0 + 1] * t);
      j++;
    }
    const consumed = Math.max(0, Math.floor(j * this.ratio));
    this.buffer = new Float32Array(merged.subarray(consumed));
    return new Float32Array(out);
  }
}

function floatToPcm16Base64(f32: Float32Array): string {
  const i16 = new Int16Array(f32.length);
  for (let i = 0; i < f32.length; i++) {
    const s = Math.max(-1, Math.min(1, f32[i]));
    i16[i] = Math.round(s * 0x7fff);
  }
  const u8 = new Uint8Array(i16.buffer);
  let binary = "";
  for (let i = 0; i < u8.length; i++) binary += String.fromCharCode(u8[i]);
  return btoa(binary);
}

export type MicCapture = {
  /** Stop tracks, disconnect graph, close context. */
  stop: () => Promise<void>;
};

/**
 * Captures microphone audio, resamples to 16 kHz PCM16 LE, base64-encodes chunks for Live API.
 */
export async function startLiveMicCapture(options: {
  onPcm16Base64Chunk: (b64: string) => void;
  signal?: AbortSignal;
}): Promise<MicCapture> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });

  const ctx = new (getAudioContextCtor())();
  const source = ctx.createMediaStreamSource(stream);
  const resampler = new FloatTo16kResampler(ctx.sampleRate);

  // ScriptProcessor is widely supported for small Live chunks; buffer size affects latency.
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  processor.onaudioprocess = (e) => {
    if (options.signal?.aborted) return;
    const input = e.inputBuffer.getChannelData(0);
    const f32 = resampler.push(input);
    if (f32.length === 0) return;
    options.onPcm16Base64Chunk(floatToPcm16Base64(f32));
  };

  const mute = ctx.createGain();
  mute.gain.value = 0;
  source.connect(processor);
  processor.connect(mute);
  mute.connect(ctx.destination);

  const onAbort = () => {
    void stopInternal();
  };
  options.signal?.addEventListener("abort", onAbort);

  async function stopInternal() {
    options.signal?.removeEventListener("abort", onAbort);
    processor.disconnect();
    source.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    await ctx.close();
  }

  if (ctx.state === "suspended") {
    await ctx.resume();
  }

  return { stop: stopInternal };
}

export type Pcm24Player = {
  enqueuePcm16Base64: (b64: string) => void;
  interrupt: () => void;
  destroy: () => Promise<void>;
};

/**
 * Schedules incoming 24 kHz PCM16 LE chunks for playback (Live output format).
 */
export function createLivePcm24Player(): Pcm24Player {
  let ctx: AudioContext | null = null;
  let processor: ScriptProcessorNode | null = null;
  const queue: Float32Array[] = [];
  let current: Float32Array | null = null;
  let offset = 0;

  function ensureGraph() {
    if (ctx) return;
    ctx = new (getAudioContextCtor())({ sampleRate: LIVE_OUTPUT_RATE });
    processor = ctx.createScriptProcessor(2048, 0, 1);
    processor.onaudioprocess = (e) => {
      const out = e.outputBuffer.getChannelData(0);
      for (let i = 0; i < out.length; i++) {
        if (!current || offset >= current.length) {
          current = queue.shift() ?? null;
          offset = 0;
        }
        out[i] = current ? current[offset++] : 0;
      }
    };
    processor.connect(ctx.destination);
  }

  return {
    enqueuePcm16Base64(b64: string) {
      ensureGraph();
      if (!ctx) return;
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const int16 = new Int16Array(bytes.buffer);
      const f32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;
      queue.push(f32);
      if (ctx.state === "suspended") {
        void ctx.resume();
      }
    },
    interrupt() {
      queue.length = 0;
      current = null;
      offset = 0;
    },
    async destroy() {
      if (processor) {
        processor.disconnect();
        processor = null;
      }
      if (ctx) {
        await ctx.close();
        ctx = null;
      }
      queue.length = 0;
      current = null;
      offset = 0;
    },
  };
}
