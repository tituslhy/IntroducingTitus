import { getVoiceEngine, resetVoiceEngineForTests } from "@/lib/voice-reply/engine";

type Listener = (event: { data?: unknown; message?: string }) => void;

/** A stand-in for the worker: records what the page posts, and lets a test emit what the worker would send. */
function makeFakeWorker() {
  const posted: Record<string, unknown>[] = [];
  const listeners: Record<string, Listener[]> = {};
  const worker = {
    postMessage: (message: Record<string, unknown>) => void posted.push(message),
    addEventListener: (type: string, fn: Listener) => void (listeners[type] ??= []).push(fn),
    removeEventListener: (type: string, fn: Listener) => {
      listeners[type] = (listeners[type] ?? []).filter((l) => l !== fn);
    },
    terminate: jest.fn(),
  };
  return {
    worker: worker as unknown as Worker,
    posted,
    terminate: worker.terminate,
    send: (data: Record<string, unknown>) => (listeners.message ?? []).forEach((l) => l({ data })),
    crash: (message = "boom") => (listeners.error ?? []).forEach((l) => l({ message })),
    postedOfType: (type: string) => posted.filter((m) => m.type === type),
  };
}

function setup() {
  const fake = makeFakeWorker();
  const make = jest.fn(() => fake.worker);
  const engine = getVoiceEngine(make);
  return { fake, make, engine };
}

const audio = (n = 3) => new Float32Array(n).fill(0.5);

afterEach(() => resetVoiceEngineForTests());

describe("getVoiceEngine", () => {
  it("is a singleton for the page, and starts idle without making a worker", () => {
    const { engine, make } = setup();
    expect(getVoiceEngine()).toBe(engine);
    expect(engine.state).toBe("idle");
    expect(make).not.toHaveBeenCalled();
  });
});

describe("load", () => {
  it("posts one load however often it is called, and ready resolves it", async () => {
    const { engine, fake, make } = setup();
    const a = engine.load();
    const b = engine.load();
    expect(a).toBe(b);
    expect(engine.state).toBe("loading");
    expect(fake.postedOfType("load")).toHaveLength(1);
    expect(make).toHaveBeenCalledTimes(1);
    fake.send({ type: "ready" });
    await expect(a).resolves.toBeUndefined();
    expect(engine.state).toBe("ready");
    await engine.load();
    expect(fake.postedOfType("load")).toHaveLength(1);
  });

  it("rejects and fails on an error with no id", async () => {
    const { engine, fake } = setup();
    const p = engine.load();
    fake.send({ type: "error", message: "no webgpu" });
    await expect(p).rejects.toThrow("no webgpu");
    expect(engine.state).toBe("failed");
    await expect(engine.load()).rejects.toThrow("no webgpu");
    expect(fake.postedOfType("load")).toHaveLength(1);
  });

  it("rejects and fails when the worker script itself fails to load", async () => {
    const { engine, fake } = setup();
    const p = engine.load();
    fake.crash("script failed");
    await expect(p).rejects.toThrow("script failed");
    expect(engine.state).toBe("failed");
  });

  it("rejects pending speaks when the engine fails", async () => {
    const { engine, fake } = setup();
    const p = engine.load().catch(() => {});
    const { audio: pending } = engine.speak("Hello.");
    fake.send({ type: "error", message: "dead" });
    await expect(pending).rejects.toThrow("dead");
    await p;
  });
});

describe("onProgress", () => {
  it("reports loaded over total as a fraction, 0 when total is 0, and 1 on ready", () => {
    const { engine, fake } = setup();
    const seen: number[] = [];
    engine.onProgress((f) => seen.push(f));
    void engine.load();
    fake.send({ type: "progress", loaded: 0, total: 0 });
    fake.send({ type: "progress", loaded: 25, total: 100 });
    fake.send({ type: "ready" });
    expect(seen).toEqual([0, 0.25, 1]);
  });

  it("stops calling a listener once it is unsubscribed", () => {
    const { engine, fake } = setup();
    const cb = jest.fn();
    const off = engine.onProgress(cb);
    void engine.load();
    fake.send({ type: "progress", loaded: 1, total: 2 });
    off();
    fake.send({ type: "progress", loaded: 2, total: 2 });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});

describe("speak", () => {
  it("posts speak with an increasing id and resolves with the matching audio only", async () => {
    const { engine, fake } = setup();
    void engine.load();
    fake.send({ type: "ready" });
    const one = engine.speak("One.");
    const two = engine.speak("Two.");
    expect(two.id).toBeGreaterThan(one.id);
    expect(fake.postedOfType("speak")).toEqual([
      { type: "speak", id: one.id, text: "One." },
      { type: "speak", id: two.id, text: "Two." },
    ]);
    const a2 = audio(2);
    fake.send({ type: "audio", id: two.id, audio: a2, sampleRate: 24000 });
    await expect(two.audio).resolves.toEqual({ audio: a2, sampleRate: 24000 });
    const a1 = audio(1);
    fake.send({ type: "audio", id: one.id, audio: a1, sampleRate: 24000 });
    await expect(one.audio).resolves.toEqual({ audio: a1, sampleRate: 24000 });
  });

  it("starts loading if nobody has, so the worker is never asked to speak unloaded", () => {
    const { engine, fake } = setup();
    engine.speak("Hi.");
    expect(fake.posted.map((m) => m.type)).toEqual(["load", "speak"]);
  });

  it("rejects only the sentence an id-bearing error names", async () => {
    const { engine, fake } = setup();
    void engine.load();
    fake.send({ type: "ready" });
    const one = engine.speak("One.");
    const two = engine.speak("Two.");
    fake.send({ type: "error", id: one.id, message: "bad sentence" });
    await expect(one.audio).rejects.toThrow("bad sentence");
    expect(engine.state).toBe("ready");
    fake.send({ type: "audio", id: two.id, audio: audio(), sampleRate: 24000 });
    await expect(two.audio).resolves.toBeDefined();
  });

  it("rejects straight away once the engine has failed", async () => {
    const { engine, fake } = setup();
    const p = engine.load();
    fake.send({ type: "error", message: "dead" });
    await p.catch(() => {});
    await expect(engine.speak("Hi.").audio).rejects.toThrow("dead");
    expect(fake.postedOfType("speak")).toHaveLength(0);
  });
});

describe("cancelAll", () => {
  it("rejects pending speaks with an AbortError and tells the worker to cancel up to the last id", async () => {
    const { engine, fake } = setup();
    void engine.load();
    fake.send({ type: "ready" });
    const one = engine.speak("One.");
    const two = engine.speak("Two.");
    engine.cancelAll();
    await expect(one.audio).rejects.toMatchObject({ name: "AbortError" });
    await expect(two.audio).rejects.toMatchObject({ name: "AbortError" });
    expect(fake.postedOfType("cancel")).toEqual([{ type: "cancel", upTo: two.id }]);
  });

  it("ignores audio that arrives late for a cancelled id, and still serves later speaks", async () => {
    const { engine, fake } = setup();
    void engine.load();
    fake.send({ type: "ready" });
    const old = engine.speak("Old.");
    old.audio.catch(() => {});
    engine.cancelAll();
    expect(() => fake.send({ type: "audio", id: old.id, audio: audio(), sampleRate: 24000 })).not.toThrow();
    const fresh = engine.speak("Fresh.");
    expect(fresh.id).toBeGreaterThan(old.id);
    fake.send({ type: "audio", id: old.id, audio: audio(9), sampleRate: 24000 });
    const a = audio(2);
    fake.send({ type: "audio", id: fresh.id, audio: a, sampleRate: 24000 });
    await expect(fresh.audio).resolves.toEqual({ audio: a, sampleRate: 24000 });
  });

  it("does nothing when no worker exists yet", () => {
    const { engine, make } = setup();
    expect(() => engine.cancelAll()).not.toThrow();
    expect(make).not.toHaveBeenCalled();
  });
});

describe("resetVoiceEngineForTests", () => {
  it("ends the worker and gives the next call a fresh engine", () => {
    const { engine, fake } = setup();
    void engine.load();
    resetVoiceEngineForTests();
    expect(fake.terminate).toHaveBeenCalled();
    expect(getVoiceEngine(() => makeFakeWorker().worker)).not.toBe(engine);
  });
});
