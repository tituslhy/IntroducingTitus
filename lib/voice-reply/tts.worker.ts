// Runs Kokoro (kokoro-js) off the main thread, so the drawer never freezes while it speaks.
// Protocol: in  { type: "load", dtype, device } | { type: "speak", id, text, voice }
//           out { type: "progress", file, loaded, total } | { type: "ready", loadMs, device, dtype }
//               | { type: "audio", id, audio, sampleRate, genMs } | { type: "error", id?, message }

// First, before kokoro-js: Safari needs it to unpack the phonemizer's dictionary (see the file).
import "./stream-polyfill";
import { KokoroTTS } from "kokoro-js";

type Dtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";
type Device = "wasm" | "webgpu";
type Voice = Parameters<KokoroTTS["generate"]>[1] extends infer O ? (O extends { voice?: infer V } ? V : never) : never;

type InMessage =
  | { type: "load"; dtype: Dtype; device: Device }
  | { type: "speak"; id: number; text: string; voice: string };

const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";

// The worker's own scope, typed by hand: the "webworker" lib would retype `self` and `addEventListener` across
// the whole project.
type WorkerScope = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<InMessage>) => void) | null;
};
const ctx = self as unknown as WorkerScope;
let loading: Promise<KokoroTTS> | null = null;
// Sentences are spoken in the order they arrive: one at a time, so each one's timing is its own.
let queue: Promise<void> = Promise.resolve();

function load(dtype: Dtype, device: Device): Promise<KokoroTTS> {
  if (!loading) {
    const started = performance.now();
    loading = KokoroTTS.from_pretrained(MODEL_ID, {
      dtype,
      device,
      progress_callback: (p) => {
        if (p.status === "progress") {
          ctx.postMessage({ type: "progress", file: p.file, loaded: p.loaded, total: p.total });
        }
      },
    }).then((tts) => {
      ctx.postMessage({ type: "ready", loadMs: Math.round(performance.now() - started), device, dtype });
      return tts;
    });
    loading.catch((error: unknown) => {
      loading = null;
      ctx.postMessage({ type: "error", message: error instanceof Error ? error.message : String(error) });
    });
  }
  return loading;
}

ctx.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  if (msg.type === "load") {
    void load(msg.dtype, msg.device).catch(() => {});
    return;
  }
  if (msg.type === "speak") {
    queue = queue.then(async () => {
      try {
        if (!loading) throw new Error("Load the model first.");
        const tts = await loading;
        const started = performance.now();
        const raw = await tts.generate(msg.text, { voice: msg.voice as Voice });
        const genMs = Math.round(performance.now() - started);
        const audio = raw.audio as Float32Array;
        ctx.postMessage({ type: "audio", id: msg.id, audio, sampleRate: raw.sampling_rate, genMs }, [audio.buffer]);
      } catch (error) {
        ctx.postMessage({ type: "error", id: msg.id, message: error instanceof Error ? error.message : String(error) });
      }
    });
  }
};
