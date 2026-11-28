import { act, fireEvent, render, renderHook, screen } from "@testing-library/react";
import {
  DownloadOffer,
  HearAgainButton,
  LATE_MS,
  SpeakingStrip,
  SpokenTag,
  ThinkingVoiceLine,
  VoiceFallbackLine,
  useVoiceReply,
} from "./VoiceReply";
import { clearHighlight, highlightSentence } from "@/lib/voice-reply/highlight";
import type { ReplyPlayerOptions } from "@/lib/voice-reply/player";

// ---- Fakes for the engine, the player and the browser checks (Tasks 3–5 are tested on their own) ----

interface Spoken {
  id: number;
  text: string;
  resolve(value: { audio: Float32Array; sampleRate: number }): void;
  reject(reason: Error): void;
}

class FakeEngine {
  state: "idle" | "loading" | "ready" | "failed" = "idle";
  listeners = new Set<(fraction: number) => void>();
  spoken: Spoken[] = [];
  /** The order the hook called onProgress and load in, to check it listens before it loads. */
  calls: string[] = [];
  private settle: { resolve(): void; reject(e: Error): void } | null = null;
  private promise: Promise<void> | null = null;
  private lastId = 0;

  load = jest.fn(() => {
    this.calls.push("load");
    if (!this.promise) {
      this.state = "loading";
      this.promise = new Promise<void>((resolve, reject) => (this.settle = { resolve, reject }));
    }
    return this.promise;
  });
  onProgress = jest.fn((cb: (fraction: number) => void) => {
    this.calls.push("onProgress");
    this.listeners.add(cb);
    return () => void this.listeners.delete(cb);
  });
  speak = jest.fn((text: string) => {
    const id = ++this.lastId;
    let entry!: Spoken;
    const audio = new Promise<{ audio: Float32Array; sampleRate: number }>((resolve, reject) => {
      entry = { id, text, resolve, reject };
    });
    this.spoken.push(entry);
    return { id, audio };
  });
  cancelAll = jest.fn();

  progress(fraction: number) {
    this.listeners.forEach((cb) => cb(fraction));
  }
  becomeReady() {
    this.state = "ready";
    this.settle?.resolve();
  }
  failToLoad() {
    this.state = "failed";
    this.settle?.reject(new Error("The voice failed to load."));
  }
  texts() {
    return this.spoken.map((s) => s.text);
  }
}

class FakePlayer {
  expected: number[] = [];
  played: number[] = [];
  finished = false;
  stopped = false;
  constructor(public opts: ReplyPlayerOptions) {}
  expect = (i: number) => void this.expected.push(i);
  play = (i: number) => void this.played.push(i);
  finish = () => void (this.finished = true);
  stop = () => void (this.stopped = true);
}

let mockEngine: FakeEngine;
let mockPlayers: FakePlayer[];
let mockSupport: { speak: boolean; cached: boolean };

jest.mock("@/lib/voice-reply/engine", () => ({ getVoiceEngine: () => mockEngine }));
jest.mock("@/lib/voice-reply/player", () => ({
  createReplyPlayer: (_ctx: unknown, opts: ReplyPlayerOptions) => {
    const player = new FakePlayer(opts);
    mockPlayers.push(player);
    return player;
  },
}));
jest.mock("@/lib/voice-reply/support", () => ({
  ...jest.requireActual("@/lib/voice-reply/support"),
  canSpeak: async () => mockSupport.speak,
  isVoiceCached: async () => mockSupport.cached,
}));
jest.mock("@/lib/voice-reply/highlight", () => ({ highlightSentence: jest.fn(), clearHighlight: jest.fn() }));

class FakeAudioContext {
  static made = 0;
  state: "suspended" | "running" | "closed" = "suspended";
  currentTime = 0;
  destination = {};
  constructor() {
    FakeAudioContext.made += 1;
  }
  resume = jest.fn(async () => {
    this.state = "running";
  });
}

function setPointer(coarse: boolean) {
  window.matchMedia = jest.fn((query: string) => ({
    matches: coarse && query === "(pointer: coarse)",
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  })) as unknown as typeof window.matchMedia;
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

const KEY = "reply-1";
const player = () => mockPlayers[mockPlayers.length - 1];
const lastPhase = (r: { current: ReturnType<typeof useVoiceReply> }) => r.current.status?.phase ?? null;

describe("useVoiceReply", () => {
  let originalMatchMedia: typeof window.matchMedia;
  let now: jest.SpyInstance<number, []>;
  let clock = 1_000_000;

  beforeEach(() => {
    mockEngine = new FakeEngine();
    mockPlayers = [];
    mockSupport = { speak: true, cached: false };
    originalMatchMedia = window.matchMedia;
    setPointer(false);
    FakeAudioContext.made = 0;
    (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
    clock = 1_000_000;
    now = jest.spyOn(Date, "now").mockImplementation(() => clock);
    jest.mocked(highlightSentence).mockClear();
    jest.mocked(clearHighlight).mockClear();
  });
  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    delete (window as unknown as { AudioContext?: unknown }).AudioContext;
    delete (navigator as unknown as { audioSession?: unknown }).audioSession;
    now.mockRestore();
  });

  /** A hook whose voice is already loaded (a returning visitor, or a second question). */
  async function readyHook() {
    mockSupport.cached = true;
    const hook = renderHook(() => useVoiceReply());
    act(() => hook.result.current.prime());
    await flush();
    act(() => mockEngine.becomeReady());
    await flush();
    return hook;
  }

  describe("prime", () => {
    it("sets the audio session to playback, then makes and resumes one AudioContext", () => {
      const session = { type: "auto" };
      Object.defineProperty(navigator, "audioSession", { value: session, configurable: true });
      const { result } = renderHook(() => useVoiceReply());

      act(() => result.current.prime());
      act(() => result.current.prime());

      expect(session.type).toBe("playback");
      expect(FakeAudioContext.made).toBe(1);
    });

    it("leaves the audio session and the AudioContext alone while the mic is recording", () => {
      const session = { type: "auto" };
      Object.defineProperty(navigator, "audioSession", { value: session, configurable: true });
      const { result } = renderHook(() => useVoiceReply());

      act(() => result.current.prime({ recording: true }));

      expect(session.type).toBe("auto");
      expect(FakeAudioContext.made).toBe(0);
    });

    it("on a computer without the voice yet, starts the download, listening for progress first", async () => {
      const { result } = renderHook(() => useVoiceReply());
      act(() => result.current.prime({ recording: true }));
      await flush();

      expect(mockEngine.load).toHaveBeenCalledTimes(1);
      expect(mockEngine.calls.slice(0, 2)).toEqual(["onProgress", "load"]);
      expect(result.current.status).toBeNull();
    });

    it("on a phone without the voice yet, offers the download instead and downloads nothing", async () => {
      setPointer(true);
      const { result } = renderHook(() => useVoiceReply());
      act(() => result.current.prime({ recording: true }));
      await flush();

      expect(lastPhase(result)).toBe("offer");
      expect(mockEngine.load).not.toHaveBeenCalled();
    });

    it("on a phone that already has the voice, makes no offer and loads it", async () => {
      setPointer(true);
      mockSupport.cached = true;
      const { result } = renderHook(() => useVoiceReply());
      act(() => result.current.prime({ recording: true }));
      await flush();

      expect(result.current.status).toBeNull();
      expect(mockEngine.load).toHaveBeenCalledTimes(1);
    });

    it("without WebGPU, downloads nothing and says it is not supported", async () => {
      mockSupport.speak = false;
      const { result } = renderHook(() => useVoiceReply());
      act(() => result.current.prime({ recording: true }));
      await flush();

      expect(mockEngine.load).not.toHaveBeenCalled();
      expect(result.current.supported).toBe(false);
    });
  });

  describe("the phone's offer", () => {
    async function phoneWithOffer() {
      setPointer(true);
      const hook = renderHook(() => useVoiceReply());
      act(() => hook.result.current.prime({ recording: true }));
      await flush();
      return hook;
    }

    it("“Speak replies” starts the download, and the waiting question then waits for the voice", async () => {
      const { result } = await phoneWithOffer();
      act(() => result.current.begin(KEY));
      await flush();
      expect(lastPhase(result)).toBe("offer");
      expect(result.current.status?.key).toBe(KEY);

      act(() => result.current.answerOffer(true));
      await flush();

      expect(mockEngine.load).toHaveBeenCalledTimes(1);
      expect(result.current.status).toMatchObject({ key: KEY, phase: "loading", firstTime: true });
    });

    it("“Text is fine” speaks nothing for this reply, and does not ask again for the next spoken question", async () => {
      const { result } = await phoneWithOffer();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.answerOffer(false));
      await flush();
      expect(result.current.status).toBeNull();

      act(() => {
        result.current.feed("Hello there. More");
        result.current.finish("Hello there. More.");
      });
      act(() => result.current.prime({ recording: true }));
      act(() => result.current.begin("reply-2"));
      await flush();

      expect(result.current.status).toBeNull();
      expect(mockEngine.load).not.toHaveBeenCalled();
      expect(mockEngine.speak).not.toHaveBeenCalled();
    });
  });

  describe("the first time: waiting for the download", () => {
    async function downloading() {
      const hook = renderHook(() => useVoiceReply());
      act(() => hook.result.current.prime({ recording: true }));
      await flush();
      act(() => hook.result.current.begin(KEY));
      await flush();
      return hook;
    }

    it("reports the real percentage and megabytes, never going backwards", async () => {
      const { result } = await downloading();
      act(() => mockEngine.progress(0.38));
      expect(result.current.status).toMatchObject({ phase: "loading", firstTime: true, progress: 38, loadedMb: 65 });

      act(() => mockEngine.progress(0.2));
      expect(result.current.status).toMatchObject({ progress: 38, loadedMb: 65 });
    });

    it("a cached voice is no first time", async () => {
      mockSupport.cached = true;
      const { result } = await downloading();
      expect(result.current.status).toMatchObject({ phase: "loading", firstTime: false });
    });

    it("ready while the reply streams: starts speaking what has arrived", async () => {
      const { result } = await downloading();
      act(() => result.current.feed("I started in supply chain. Then"));
      expect(mockEngine.speak).not.toHaveBeenCalled();

      act(() => mockEngine.becomeReady());
      await flush();

      expect(lastPhase(result)).toBe("speaking");
      expect(mockEngine.texts()).toEqual(["I started in supply chain."]);
    });

    it("ready within 8 s of the reply finishing, with no interaction: speech starts by itself", async () => {
      const { result } = await downloading();
      act(() => result.current.finish("One sentence. Two sentences."));
      clock += LATE_MS - 500;
      act(() => mockEngine.becomeReady());
      await flush();

      expect(lastPhase(result)).toBe("speaking");
      expect(mockEngine.texts()).toEqual(["One sentence.", "Two sentences."]);
      expect(player().finished).toBe(true);
    });

    it("ready more than 8 s after the reply finished: the late strip, and nothing said", async () => {
      const { result } = await downloading();
      act(() => result.current.finish("One sentence. Two sentences."));
      clock += LATE_MS + 1;
      act(() => mockEngine.becomeReady());
      await flush();

      expect(lastPhase(result)).toBe("late");
      expect(mockEngine.speak).not.toHaveBeenCalled();
    });

    it("ready in time, but the visitor typed, tapped the mic or scrolled since: the late strip", async () => {
      const { result } = await downloading();
      act(() => result.current.finish("One sentence."));
      act(() => result.current.noteInteraction());
      act(() => mockEngine.becomeReady());
      await flush();

      expect(lastPhase(result)).toBe("late");
      expect(mockEngine.speak).not.toHaveBeenCalled();
    });

    it("“Hear this reply” on the late strip plays it from sentence 0", async () => {
      const { result } = await downloading();
      act(() => result.current.finish("One sentence. Two sentences."));
      clock += LATE_MS + 1;
      act(() => mockEngine.becomeReady());
      await flush();

      act(() => result.current.hearAgain(KEY));

      expect(lastPhase(result)).toBe("speaking");
      expect(mockEngine.texts()).toEqual(["One sentence.", "Two sentences."]);
      expect(player().expected).toEqual([0, 1]);
    });

    it("the late strip stays when the visitor types (stop); its ✕ (justRead) dismisses it", async () => {
      const { result } = await downloading();
      act(() => result.current.finish("One sentence."));
      act(() => result.current.noteInteraction());
      act(() => mockEngine.becomeReady());
      await flush();

      act(() => result.current.stop());
      expect(lastPhase(result)).toBe("late");
      act(() => result.current.justRead());
      expect(result.current.status).toBeNull();
    });

    it("stopped mid-stream, the voice arriving before the reply is in: “Hear this reply” reads what has arrived", async () => {
      const { result } = await downloading();
      act(() => result.current.feed("One sentence. Two"));
      act(() => result.current.stop());
      act(() => mockEngine.becomeReady());
      await flush();
      expect(lastPhase(result)).toBe("late");

      act(() => result.current.hearAgain(KEY));
      expect(lastPhase(result)).toBe("speaking");
      expect(mockEngine.texts()).toEqual(["One sentence."]);
      act(() => result.current.finish("One sentence. Two sentences."));
      expect(mockEngine.texts()).toEqual(["One sentence.", "Two sentences."]);
      expect(player().finished).toBe(true);
    });

    it("“Just read”: nothing is spoken for this reply when the voice arrives", async () => {
      const { result } = await downloading();
      act(() => result.current.finish("One sentence."));
      act(() => result.current.justRead());
      expect(result.current.status).toBeNull();

      act(() => mockEngine.becomeReady());
      await flush();

      expect(mockEngine.speak).not.toHaveBeenCalled();
      expect(result.current.status).toBeNull();
    });

    it("stopped (the drawer closed) while the download is pending: nothing is spoken when it resolves", async () => {
      const { result } = await downloading();
      act(() => result.current.feed("One sentence. Two"));
      act(() => result.current.stop());
      act(() => mockEngine.becomeReady());
      await flush();
      act(() => result.current.finish("One sentence. Two."));
      await flush();

      expect(mockEngine.speak).not.toHaveBeenCalled();
    });

    it("the download failing: the fallback line", async () => {
      const { result } = await downloading();
      act(() => mockEngine.failToLoad());
      await flush();

      expect(lastPhase(result)).toBe("failed");
    });
  });

  describe("speaking a streaming reply", () => {
    it("sends each sentence to the engine once it is complete, and the last fragment on finish", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      expect(lastPhase(result)).toBe("speaking");

      act(() => result.current.feed("I started at Toyota. Then I"));
      expect(mockEngine.texts()).toEqual(["I started at Toyota."]);
      act(() => result.current.feed("I started at Toyota. Then I moved into data science. Now"));
      expect(mockEngine.texts()).toEqual(["I started at Toyota.", "Then I moved into data science."]);
      act(() => result.current.finish("I started at Toyota. Then I moved into data science. Now I lead AI"));

      expect(mockEngine.texts()).toEqual(["I started at Toyota.", "Then I moved into data science.", "Now I lead AI"]);
      expect(player().expected).toEqual([0, 1, 2]);
      expect(player().finished).toBe(true);
    });

    it("holds a sentence ending in a full stop until more text arrives, so “etc.” can grow", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();

      act(() => result.current.feed("I used LangChain, DSPy etc."));
      expect(mockEngine.speak).not.toHaveBeenCalled();
      act(() => result.current.feed("I used LangChain, DSPy etc. and more"));
      expect(mockEngine.speak).not.toHaveBeenCalled();
      act(() => result.current.finish("I used LangChain, DSPy etc. and more."));

      expect(mockEngine.texts()).toEqual(["I used LangChain, DSPy etc. and more."]);
    });

    it("never sends the same sentence twice", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();

      act(() => result.current.feed("One here. Two"));
      act(() => result.current.feed("One here. Two"));
      act(() => result.current.feed("One here. Two there. Three"));
      act(() => result.current.finish("One here. Two there. Three."));

      expect(mockEngine.texts()).toEqual(["One here.", "Two there.", "Three."]);
    });

    it("hands each sentence's audio to the player, and highlights it in the reply as it plays", async () => {
      document.body.innerHTML = `<article id="copilot-msg-${KEY}">One here.</article>`;
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.finish("One here."));

      await act(async () => mockEngine.spoken[0].resolve({ audio: new Float32Array(4), sampleRate: 24000 }));
      expect(player().played).toEqual([0]);

      act(() => player().opts.onSentence(0));
      expect(highlightSentence).toHaveBeenCalledWith(document.getElementById(`copilot-msg-${KEY}`), "One here.");
      document.body.innerHTML = "";
    });

    it("done: stops the player, clears the highlight and offers “hear again”", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.finish("One here."));

      act(() => player().opts.onDone());

      expect(player().stopped).toBe(true);
      expect(clearHighlight).toHaveBeenCalled();
      expect(result.current.status).toMatchObject({ key: KEY, phase: "done" });
    });

    it("“hear again” replays from sentence 0, with the audio it kept", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.finish("One here. Two there."));
      await act(async () => {
        mockEngine.spoken[0].resolve({ audio: new Float32Array(4), sampleRate: 24000 });
        mockEngine.spoken[1].resolve({ audio: new Float32Array(4), sampleRate: 24000 });
      });
      act(() => player().opts.onDone());
      const first = player();

      act(() => result.current.hearAgain(KEY));

      expect(player()).not.toBe(first);
      expect(player().expected).toEqual([0, 1]);
      expect(player().played).toEqual([0, 1]);
      expect(mockEngine.speak).toHaveBeenCalledTimes(2);
      expect(lastPhase(result)).toBe("speaking");
    });

    it("“hear again” only works for the reply it belongs to", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.finish("One here."));
      act(() => player().opts.onDone());

      act(() => result.current.hearAgain("another-reply"));
      expect(mockPlayers).toHaveLength(1);
    });

    it("stop: silences the player, drops the engine's queue, and the reply can be heard again", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.finish("One here. Two there."));

      act(() => result.current.stop());

      expect(player().stopped).toBe(true);
      expect(mockEngine.cancelAll).toHaveBeenCalled();
      expect(clearHighlight).toHaveBeenCalled();
      expect(result.current.status).toMatchObject({ key: KEY, phase: "done" });
    });

    it("stop mid-stream: nothing more is sent, and “hear again” comes once the reply is in", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.feed("One here. Two"));
      act(() => result.current.stop());
      expect(result.current.status).toBeNull();

      act(() => result.current.feed("One here. Two there. Three"));
      act(() => result.current.finish("One here. Two there. Three."));

      expect(mockEngine.texts()).toEqual(["One here."]);
      expect(lastPhase(result)).toBe("done");
    });

    it("a stall: stops the player and shows the fallback line", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.feed("One here. Two"));

      act(() => player().opts.onStall());

      expect(player().stopped).toBe(true);
      expect(result.current.status).toMatchObject({ key: KEY, phase: "failed" });
      act(() => result.current.finish("One here. Two there."));
      expect(mockEngine.texts()).toEqual(["One here."]);
    });

    it("a sentence the engine fails to make: the fallback line", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.finish("One here."));

      await act(async () => mockEngine.spoken[0].reject(new Error("worker error")));

      expect(lastPhase(result)).toBe("failed");
    });

    it("without WebGPU, a spoken question gets the fallback line", async () => {
      mockSupport.speak = false;
      const { result } = renderHook(() => useVoiceReply());
      act(() => result.current.begin(KEY));
      await flush();

      expect(lastPhase(result)).toBe("failed");
      act(() => result.current.finish("One here."));
      expect(mockEngine.speak).not.toHaveBeenCalled();
    });

    it("once the browser is known, the next question decides at once (no flash of the out-loud line)", async () => {
      mockSupport.speak = false;
      const { result } = renderHook(() => useVoiceReply());
      act(() => result.current.prime({ recording: true }));
      await flush();

      act(() => result.current.begin(KEY));

      expect(lastPhase(result)).toBe("failed");
    });

    it("a new question drops the engine's queue even when the voice was loaded before this drawer (a remount)", async () => {
      mockEngine.state = "ready";
      const { result } = renderHook(() => useVoiceReply());
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.feed("One here. Two"));
      mockEngine.cancelAll.mockClear();

      act(() => result.current.begin("reply-2"));

      expect(mockEngine.cancelAll).toHaveBeenCalled();
    });

    it("a second spoken question during speech stops the first; the first's late audio never plays", async () => {
      const { result } = await readyHook();
      act(() => result.current.begin(KEY));
      await flush();
      act(() => result.current.feed("First reply here. More"));
      const first = player();

      act(() => result.current.begin("reply-2"));
      await flush();
      expect(first.stopped).toBe(true);
      expect(mockEngine.cancelAll).toHaveBeenCalled();
      act(() => result.current.feed("Second reply. More"));
      const second = player();

      // The first question's sentence comes back after all (a worker finishing what it had started).
      await act(async () => mockEngine.spoken[0].resolve({ audio: new Float32Array(4), sampleRate: 24000 }));

      expect(first.played).toEqual([]);
      expect(second.played).toEqual([]);
      expect(second.expected).toEqual([0]);
      expect(result.current.status?.key).toBe("reply-2");
    });
  });
});

describe("the voice pieces", () => {
  it("SpokenTag reads “spoken”", () => {
    render(<SpokenTag />);
    expect(screen.getByText("spoken")).toBeInTheDocument();
  });

  it("ThinkingVoiceLine says it will answer out loud, and the first-time step shows the real numbers", () => {
    const { rerender } = render(<ThinkingVoiceLine />);
    expect(screen.getByText("You asked out loud, so I’ll answer out loud.")).toBeInTheDocument();
    expect(screen.queryByText(/First time only/)).toBeNull();

    rerender(<ThinkingVoiceLine download={{ progress: 38, loadedMb: 65 }} />);
    expect(screen.getByText("Getting my voice ready").parentElement).toHaveTextContent(/^Getting my voice ready · 38%$/);
    expect(
      screen.getByText("First time only: 65 of 172 MB. Your browser keeps it, so next time I answer straight away.")
    ).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "38");
  });

  describe("SpeakingStrip", () => {
    it("the late strip's ✕ is a 44px target on a phone", () => {
      const noop = () => {};
      render(<SpeakingStrip phase="late" progress={0} still={false} onStop={noop} onJustRead={noop} onHear={noop} onDismiss={noop} />);
      expect(screen.getByRole("button", { name: "Dismiss" })).toHaveClass("max-[640px]:min-h-[44px]", "max-[640px]:min-w-[44px]");
    });

    const noop = () => {};
    const props = { progress: 0, still: false, onStop: noop, onJustRead: noop, onHear: noop, onDismiss: noop };

    it("speaking: bars, “Speaking”, “type to cut in” and Stop", () => {
      const onStop = jest.fn();
      render(<SpeakingStrip {...props} phase="speaking" onStop={onStop} />);
      expect(screen.getByRole("status")).toHaveTextContent("Speaking");
      expect(screen.getByText("type to cut in")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Stop speaking" }));
      expect(onStop).toHaveBeenCalled();
    });

    it("the bars move, except with reduced motion, where they have no animation class", () => {
      const { container, rerender } = render(<SpeakingStrip {...props} phase="speaking" />);
      const bars = () => Array.from(container.querySelectorAll("[data-voice-bars] > span"));
      expect(bars()).toHaveLength(5);
      bars().forEach((bar) => expect(bar).toHaveClass("voice-bar-move"));

      rerender(<SpeakingStrip {...props} phase="speaking" still />);
      bars().forEach((bar) => expect(bar.className).not.toMatch(/voice-bar-move|animate/));
    });

    it("loading: the percentage, “I’ll read it out as soon as it’s in.” and Just read", () => {
      const onJustRead = jest.fn();
      const { container } = render(<SpeakingStrip {...props} phase="loading" progress={86} onJustRead={onJustRead} />);
      expect(container).toHaveTextContent("Getting my voice ready · 86%");
      expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "86");
      expect(screen.getByText("I’ll read it out as soon as it’s in.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Just read" }));
      expect(onJustRead).toHaveBeenCalled();
    });

    it("late: “My voice is ready.”, Hear this reply, and a dismiss ✕", () => {
      const onHear = jest.fn();
      const onDismiss = jest.fn();
      render(<SpeakingStrip {...props} phase="late" onHear={onHear} onDismiss={onDismiss} />);
      expect(screen.getByText("My voice is ready.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Hear this reply" }));
      fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
      expect(onHear).toHaveBeenCalled();
      expect(onDismiss).toHaveBeenCalled();
    });
  });

  it("DownloadOffer: the 172 MB question, with 44px answers", () => {
    const onAnswer = jest.fn();
    render(<DownloadOffer onAnswer={onAnswer} />);
    expect(screen.getByText("I can answer out loud. It’s a one-off 172 MB download, best on Wi-Fi.")).toBeInTheDocument();
    const yes = screen.getByRole("button", { name: "Speak replies" });
    const no = screen.getByRole("button", { name: "Text is fine" });
    expect(yes).toHaveClass("min-h-[44px]");
    expect(no).toHaveClass("min-h-[44px]");
    fireEvent.click(yes);
    fireEvent.click(no);
    expect(onAnswer.mock.calls).toEqual([[true], [false]]);
  });

  it("HearAgainButton reads “hear again”", () => {
    const onClick = jest.fn();
    render(<HearAgainButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: "hear again" }));
    expect(screen.getByText("hear again")).toBeInTheDocument();
    expect(onClick).toHaveBeenCalled();
  });

  it("VoiceFallbackLine says the voice couldn’t keep up", () => {
    render(<VoiceFallbackLine />);
    expect(screen.getByText("My voice couldn’t keep up on this device, so this one’s written out.")).toBeInTheDocument();
  });
});
