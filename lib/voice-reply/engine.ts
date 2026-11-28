// The page's side of the voice worker (tts.worker.ts): one engine per page, shared by every caller.
// It posts `load` once, matches each `audio` message to the speak that asked for it, and drops audio for sentences
// that were cancelled (the worker finishes the sentence it is making even after a `cancel`).

export type EngineState = "idle" | "loading" | "ready" | "failed";

export interface SpokenAudio {
  audio: Float32Array;
  sampleRate: number;
}

export interface VoiceEngine {
  readonly state: EngineState;
  /** Starts the worker and the model download; the same promise however often it is called. */
  load(): Promise<void>;
  /** Download progress as a fraction from 0 to 1, until `ready`. Returns the way to stop listening. */
  onProgress(cb: (fraction: number) => void): () => void;
  speak(text: string): { id: number; audio: Promise<SpokenAudio> };
  /** Rejects every pending speak with an AbortError and drops what the worker has queued. */
  cancelAll(): void;
}

type WorkerMessage =
  | { type: "progress"; loaded: number; total: number }
  | { type: "ready" }
  | { type: "audio"; id: number; audio: Float32Array; sampleRate: number }
  | { type: "error"; id?: number; message: string };

interface Pending {
  resolve: (value: SpokenAudio) => void;
  reject: (reason: Error) => void;
}

// Only here is the worker made, so importing this file (as Jest does) never builds one.
const defaultMakeWorker = () => new Worker(new URL("./tts.worker.ts", import.meta.url), { type: "module" });

function abortError(): Error {
  const error = new Error("Speech cancelled.");
  error.name = "AbortError";
  return error;
}

function createEngine(makeWorker: () => Worker): VoiceEngine & { dispose(): void } {
  let worker: Worker | null = null;
  let state: EngineState = "idle";
  let failure: Error | null = null;
  let loadPromise: Promise<void> | null = null;
  let settleLoad: { resolve: () => void; reject: (reason: Error) => void } | null = null;
  let lastId = 0;
  const pending = new Map<number, Pending>();
  const listeners = new Set<(fraction: number) => void>();

  const emit = (fraction: number) => listeners.forEach((cb) => cb(Math.min(1, Math.max(0, fraction))));

  function fail(message: string) {
    if (state === "failed") return;
    state = "failed";
    failure = new Error(message);
    settleLoad?.reject(failure);
    settleLoad = null;
    for (const job of pending.values()) job.reject(failure);
    pending.clear();
  }

  function onMessage(event: MessageEvent<WorkerMessage>) {
    const msg = event.data;
    if (msg.type === "progress") {
      if (state === "loading") emit(msg.total > 0 ? msg.loaded / msg.total : 0);
    } else if (msg.type === "ready") {
      if (state !== "loading") return;
      state = "ready";
      emit(1);
      settleLoad?.resolve();
      settleLoad = null;
    } else if (msg.type === "audio") {
      // A cancelled sentence has no entry any more, so its late audio falls through here.
      const job = pending.get(msg.id);
      if (!job) return;
      pending.delete(msg.id);
      job.resolve({ audio: msg.audio, sampleRate: msg.sampleRate });
    } else if (msg.type === "error") {
      if (msg.id === undefined) {
        fail(msg.message);
      } else {
        const job = pending.get(msg.id);
        if (!job) return;
        pending.delete(msg.id);
        job.reject(new Error(msg.message));
      }
    }
  }

  function load(): Promise<void> {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise<void>((resolve, reject) => {
      settleLoad = { resolve, reject };
    });
    state = "loading";
    try {
      worker = makeWorker();
      worker.addEventListener("message", onMessage as EventListener);
      worker.addEventListener("error", ((event: ErrorEvent) =>
        fail(event.message || "The voice worker failed to start.")) as EventListener);
      worker.postMessage({ type: "load" });
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
    }
    return loadPromise;
  }

  return {
    get state() {
      return state;
    },
    load,
    onProgress(cb) {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    speak(text) {
      const id = ++lastId;
      const audio = new Promise<SpokenAudio>((resolve, reject) => {
        if (state === "failed") {
          reject(failure ?? new Error("The voice failed to load."));
          return;
        }
        pending.set(id, { resolve, reject });
        // The worker answers `speak` before `load` with an error, so make sure `load` went first.
        load().catch(() => {});
        worker?.postMessage({ type: "speak", id, text });
      });
      return { id, audio };
    },
    cancelAll() {
      for (const job of pending.values()) job.reject(abortError());
      pending.clear();
      worker?.postMessage({ type: "cancel", upTo: lastId });
    },
    dispose() {
      worker?.terminate();
      worker = null;
      listeners.clear();
    },
  };
}

let engine: (VoiceEngine & { dispose(): void }) | null = null;

/** The page's one engine. `makeWorker` is only used by the call that creates it (tests pass a fake). */
export function getVoiceEngine(makeWorker: () => Worker = defaultMakeWorker): VoiceEngine {
  engine ??= createEngine(makeWorker);
  return engine;
}

export function resetVoiceEngineForTests(): void {
  engine?.dispose();
  engine = null;
}
