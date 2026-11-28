// Runs Kokoro (kokoro-js) off the main thread, so the page never freezes while it speaks.
// Protocol: in  { type: "load" } | { type: "speak", id, text } | { type: "cancel", upTo }
//           out { type: "progress", loaded, total } | { type: "ready" }
//               | { type: "audio", id, audio, sampleRate } | { type: "error", id?, message }
// `cancel` drops the queued sentences with id <= upTo (the one being made finishes). `load` and `speak` also take
// optional `model`/`dtype`/`device` and `voice` overrides, which only the voice lab uses to compare engines.

// First, before kokoro-js: Safari needs it to unpack the phonemizer's dictionary (see the file).
import "./stream-polyfill";
import { AutoTokenizer, StyleTextToSpeech2Model, env } from "@huggingface/transformers";
import { KokoroTTS, TextSplitterStream } from "kokoro-js";
import { KOKORO_DTYPE, KOKORO_MODEL, KOKORO_VOICE, ORT_PATH } from "./config";
import { dropCancelled, sumProgress, type FileProgress } from "./worker-logic";

type Dtype = "fp32" | "fp16" | "q8" | "q4" | "q4f16";
type Device = "wasm" | "webgpu";
type Voice = Parameters<KokoroTTS["generate"]>[1] extends infer O ? (O extends { voice?: infer V } ? V : never) : never;

type InMessage =
  | { type: "load"; model?: string; dtype?: Dtype; device?: Device }
  | { type: "speak"; id: number; text: string; voice?: string }
  | { type: "cancel"; upTo: number };

// The worker's own scope, typed by hand: the "webworker" lib would retype `self` and `addEventListener` across
// the whole project.
type WorkerScope = {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<InMessage>) => void) | null;
};
const ctx = self as unknown as WorkerScope;

let loading: Promise<KokoroTTS> | null = null;
// Sentences wait here and are made one at a time, in the order they arrived.
let queue: { id: number; text: string; voice: string }[] = [];
let draining = false;

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

function load(model: string, dtype: Dtype, device: Device): Promise<KokoroTTS> {
  if (!loading) {
    const files: FileProgress = {};
    const progress_callback = (p: { status: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status === "progress") {
        ctx.postMessage({ type: "progress", ...sumProgress(files, p.file ?? "", p.loaded, p.total) });
      }
    };
    // Built by hand rather than KokoroTTS.from_pretrained, to pass session options: ONNX Runtime's "extended" graph
    // fusions merge the patched model's fp32 averages back into fp16 ones, which overflow into NaN on WebGPU.
    // "basic" keeps them apart (found in Chrome, 2026-11-28: patched model + basic = clean; + all = NaN).
    // The env settings sit inside the chain so a failure there is posted as an error, not thrown out of onmessage.
    loading = Promise.resolve()
      .then(() => {
        // The ONNX Runtime's wasm files come from this site (scripts/copy-ort.mjs), not from jsDelivr; models only
        // from Hugging Face.
        env.backends.onnx.wasm!.wasmPaths = ORT_PATH;
        env.allowLocalModels = false;
        return Promise.all([
          StyleTextToSpeech2Model.from_pretrained(model, {
            dtype,
            device,
            progress_callback,
            session_options: { graphOptimizationLevel: "basic" },
          }),
          AutoTokenizer.from_pretrained(model, { progress_callback }),
        ]);
      })
      .then(([m, tokenizer]) => {
        const tts = new KokoroTTS(m as ConstructorParameters<typeof KokoroTTS>[0], tokenizer);
        ctx.postMessage({ type: "ready" });
        return tts;
      });
    loading.catch((error: unknown) => {
      loading = null;
      ctx.postMessage({ type: "error", message: messageOf(error) });
    });
  }
  return loading;
}

async function makeAudio(tts: KokoroTTS, text: string, voice: string) {
  // Given a plain string, stream() never closes its splitter and waits forever after the last sentence: hand it
  // a closed one.
  const splitter = new TextSplitterStream();
  splitter.push(text);
  splitter.close();
  let raw: Awaited<ReturnType<KokoroTTS["generate"]>> | null = null;
  for await (const chunk of tts.stream(splitter, { voice: voice as Voice })) raw = chunk.audio;
  if (!raw) throw new Error("Nothing to say.");
  return raw;
}

async function drain() {
  if (draining) return;
  draining = true;
  try {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        if (!loading) throw new Error("Load the model first.");
        const raw = await makeAudio(await loading, job.text, job.voice);
        const audio = raw.audio as Float32Array;
        ctx.postMessage({ type: "audio", id: job.id, audio, sampleRate: raw.sampling_rate }, [audio.buffer]);
      } catch (error) {
        ctx.postMessage({ type: "error", id: job.id, message: messageOf(error) });
      }
    }
  } finally {
    draining = false;
  }
}

ctx.onmessage = (event: MessageEvent<InMessage>) => {
  const msg = event.data;
  if (msg.type === "load") {
    void load(msg.model ?? KOKORO_MODEL, msg.dtype ?? KOKORO_DTYPE, msg.device ?? "webgpu").catch(() => {});
  } else if (msg.type === "speak") {
    queue.push({ id: msg.id, text: msg.text, voice: msg.voice ?? KOKORO_VOICE });
    void drain();
  } else if (msg.type === "cancel") {
    queue = dropCancelled(queue, msg.upTo);
  }
};
