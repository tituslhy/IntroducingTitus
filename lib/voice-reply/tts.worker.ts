// Runs Kokoro (kokoro-js) off the main thread, so the drawer never freezes while it speaks.
// Protocol: in  { type: "load", dtype, device } | { type: "speak", id, text, voice }
//           out { type: "progress", file, loaded, total } | { type: "ready", loadMs, device, dtype }
//               | { type: "audio", id, audio, sampleRate, genMs } | { type: "error", id?, message }

// First, before kokoro-js: Safari needs it to unpack the phonemizer's dictionary (see the file).
import "./stream-polyfill";
import { AutoTokenizer, StyleTextToSpeech2Model, env } from "@huggingface/transformers";
import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { phonemize } from "phonemizer";

type Dtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";
type Device = "wasm" | "webgpu";
type Voice = Parameters<KokoroTTS["generate"]>[1] extends infer O ? (O extends { voice?: infer V } ? V : never) : never;

type InMessage =
  | { type: "load"; dtype: Dtype; device: Device; model?: string }
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

/** `model`: a Hugging Face id, or a folder this site serves under /voice-models/ (the patched fp16 model). */
function load(dtype: Dtype, device: Device, model = MODEL_ID): Promise<KokoroTTS> {
  if (!loading) {
    const started = performance.now();
    const local = !model.includes("/");
    env.allowLocalModels = local;
    env.allowRemoteModels = !local;
    if (local) env.localModelPath = "/voice-models/";
    const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress") {
        ctx.postMessage({ type: "progress", file: p.file, loaded: p.loaded, total: p.total });
      }
    };
    // Built by hand rather than KokoroTTS.from_pretrained, to pass session options: ONNX Runtime's "extended" graph
    // fusions merge the patched model's fp32 averages back into fp16 ones, which overflow into NaN on WebGPU.
    // "basic" keeps them apart (found in Chrome, 2026-11-28: patched model + basic = clean; + all = NaN).
    loading = Promise.all([
      StyleTextToSpeech2Model.from_pretrained(model, {
        dtype,
        device,
        progress_callback,
        session_options: { graphOptimizationLevel: "basic" },
      }),
      AutoTokenizer.from_pretrained(model, { progress_callback }),
    ]).then(([m, tokenizer]) => {
      const tts = new KokoroTTS(m as ConstructorParameters<typeof KokoroTTS>[0], tokenizer);
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
    void load(msg.dtype, msg.device, msg.model).catch(() => {});
    return;
  }
  if (msg.type === "speak") {
    queue = queue.then(async () => {
      try {
        if (!loading) throw new Error("Load the model first.");
        const tts = await loading;
        const started = performance.now();
        // Two stages, reported as they start, so a stuck sentence says where it's stuck: the words become
        // pronunciation (espeak, on the CPU; the first call unpacks its dictionary), then the model makes the sound.
        ctx.postMessage({ type: "stage", id: msg.id, stage: "pronouncing" });
        await phonemize(msg.text, "en-us");
        ctx.postMessage({ type: "stage", id: msg.id, stage: "running the model" });
        // stream() runs the same steps as generate() and also hands back the phonemes, so the lab can record the
        // exact tokens of a sentence that went wrong (to replay it in /voice-models/debug).
        let raw: Awaited<ReturnType<KokoroTTS["generate"]>> | null = null;
        let phonemes = "";
        // Given a plain string, stream() never closes its splitter and waits forever after the last sentence: hand it
        // a closed one.
        const splitter = new TextSplitterStream();
        splitter.push(msg.text);
        splitter.close();
        for await (const chunk of tts.stream(splitter, { voice: msg.voice as Voice })) {
          raw = chunk.audio;
          phonemes = chunk.phonemes;
        }
        if (!raw) throw new Error("Nothing to say.");
        const ids = Array.from(tts.tokenizer(phonemes, { truncation: true }).input_ids.data as BigInt64Array, Number);
        const genMs = Math.round(performance.now() - started);
        const audio = raw.audio as Float32Array;
        ctx.postMessage({ type: "audio", id: msg.id, audio, sampleRate: raw.sampling_rate, genMs, ids }, [audio.buffer]);
      } catch (error) {
        ctx.postMessage({ type: "error", id: msg.id, message: error instanceof Error ? error.message : String(error) });
      }
    });
  }
};
