import { createReplyPlayer, FIRST_AUDIO_MS, STALL_MS, type PlayerContext } from "@/lib/voice-reply/player";

const RATE = 24000;

/** Audio `seconds` long, filled with `tag` so a started source can be traced back to its sentence. */
function clip(seconds: number, tag: number): Float32Array {
  return new Float32Array(Math.round(seconds * RATE)).fill(tag);
}

interface FakeSource {
  buffer: { duration: number; getChannelData(channel: number): Float32Array } | null;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(): void;
  onended: ((ev: Event) => void) | null;
  startedAt: number | null;
  stopped: boolean;
  /** Which sentence this source carries, read back from the tag the test put in the audio. */
  tag(): number;
}

/**
 * A stand-in for the browser's audio clock. `advance` moves the clock and Jest's timers together
 * in 10 ms steps and ends each source once the clock passes its start plus its length, the way
 * a real one does.
 */
function makeContext() {
  let ms = 0;
  const sources: FakeSource[] = [];
  const ctx = {
    get currentTime() {
      return ms / 1000;
    },
    destination: {},
    createBuffer(_channels: number, length: number, sampleRate: number) {
      const data = new Float32Array(length);
      return { duration: length / sampleRate, getChannelData: () => data };
    },
    createBufferSource(): FakeSource {
      const source: FakeSource = {
        buffer: null,
        onended: null,
        startedAt: null,
        stopped: false,
        connect() {},
        start(when = 0) {
          source.startedAt = when;
        },
        stop() {
          source.stopped = true;
        },
        tag: () => source.buffer?.getChannelData(0)[0] ?? -1,
      };
      sources.push(source);
      return source;
    },
  };

  function advance(totalMs: number) {
    for (let done = 0; done < totalMs; done += 10) {
      ms += 10;
      jest.advanceTimersByTime(10);
      for (const s of sources) {
        if (s.stopped || s.startedAt === null || !s.buffer || !s.onended) continue;
        if (Math.round((s.startedAt + s.buffer.duration) * 1000) <= ms) {
          const fire = s.onended;
          s.onended = null;
          fire(new Event("ended"));
        }
      }
    }
  }

  return { ctx: ctx as unknown as PlayerContext, sources, advance };
}

function setup(opts: { stallMs?: number; firstAudioMs?: number } = {}) {
  const { ctx, sources, advance } = makeContext();
  const onSentence = jest.fn();
  const onDone = jest.fn();
  const onStall = jest.fn();
  const player = createReplyPlayer(ctx, { onSentence, onDone, onStall, ...opts });
  /** Sentences that have started playing, in start order. */
  const startedOrder = () =>
    sources
      .filter((s) => s.startedAt !== null)
      .sort((a, b) => a.startedAt! - b.startedAt!)
      .map((s) => s.tag());
  return { player, sources, advance, onSentence, onDone, onStall, startedOrder };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

// The drawer hands in a real AudioContext; this fails to compile if it would not fit.
function acceptsRealContext(real: AudioContext): PlayerContext {
  return real;
}
void acceptsRealContext;

describe("createReplyPlayer: order and timing", () => {
  it("plays sentences back to back in index order when audio arrives out of order", () => {
    const { player, sources, advance, startedOrder } = setup();
    player.expect(0);
    player.expect(1);
    player.expect(2);

    player.play(0, clip(1, 0), RATE);
    player.play(2, clip(1, 2), RATE);
    advance(10);
    // Sentence 2 must wait for sentence 1, not jump the queue.
    expect(startedOrder()).toEqual([0]);

    player.play(1, clip(2, 1), RATE);
    expect(startedOrder()).toEqual([0, 1, 2]);
    const byTag = (t: number) => sources.find((s) => s.tag() === t)!;
    expect(byTag(0).startedAt).toBeCloseTo(0);
    expect(byTag(1).startedAt).toBeCloseTo(1);
    expect(byTag(2).startedAt).toBeCloseTo(3);
  });

  it("starts a sentence that arrives late right away, not in the past", () => {
    const { player, sources, advance } = setup();
    player.expect(0);
    player.expect(1);
    player.play(0, clip(1, 0), RATE);
    advance(1500); // sentence 0 ended at 1.0
    player.play(1, clip(1, 1), RATE);
    expect(sources.find((s) => s.tag() === 1)!.startedAt).toBeCloseTo(1.5);
  });

  it("fires onSentence when a sentence starts playing, not when its audio arrives", () => {
    const { player, advance, onSentence } = setup();
    player.expect(0);
    player.expect(1);

    player.play(1, clip(1, 1), RATE);
    advance(100);
    expect(onSentence).not.toHaveBeenCalled(); // 1 is here but 0 is not

    player.play(0, clip(1, 0), RATE);
    advance(10);
    expect(onSentence).toHaveBeenCalledTimes(1);
    expect(onSentence).toHaveBeenLastCalledWith(0);

    advance(980); // sentence 0 began at 0.1 s, so sentence 1 begins at 1.1 s; at 1.09 s it is queued, not playing
    expect(onSentence).toHaveBeenCalledTimes(1);
    advance(20);
    expect(onSentence).toHaveBeenCalledTimes(2);
    expect(onSentence).toHaveBeenLastCalledWith(1);
  });
});

describe("createReplyPlayer: finishing", () => {
  it("fires onDone once, after the last sentence ends and finish() was called", () => {
    const { player, advance, onDone, onStall } = setup();
    player.expect(0);
    player.play(0, clip(1, 0), RATE);
    player.finish();
    advance(900);
    expect(onDone).not.toHaveBeenCalled();
    advance(200);
    expect(onDone).toHaveBeenCalledTimes(1);
    advance(20000);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("waits for finish() even when every sentence so far has ended", () => {
    const { player, advance, onDone, onStall } = setup();
    player.expect(0);
    player.play(0, clip(1, 0), RATE);
    advance(5000);
    expect(onDone).not.toHaveBeenCalled();
    // Nothing more was sent to the engine, so waiting is not a stall.
    expect(onStall).not.toHaveBeenCalled();

    player.finish();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("waits for sentences that are still being made before finishing", () => {
    const { player, advance, onDone } = setup();
    player.expect(0);
    player.expect(1);
    player.finish();
    player.play(0, clip(1, 0), RATE);
    advance(1500);
    expect(onDone).not.toHaveBeenCalled();
    player.play(1, clip(1, 1), RATE);
    advance(1000);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("is done at once when the reply ends before anything was sent to the engine", () => {
    const { player, onDone, onStall } = setup();
    player.finish();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onStall).not.toHaveBeenCalled();
  });
});

describe("createReplyPlayer: stalls", () => {
  it("gives up when the next sentence arrives more than stallMs after the previous one ended", () => {
    const { player, advance, onStall, onSentence, onDone, startedOrder } = setup();
    player.expect(0);
    player.expect(1);
    player.play(0, clip(1, 0), RATE);
    advance(1000 + STALL_MS - 10);
    expect(onStall).not.toHaveBeenCalled();
    advance(20);
    expect(onStall).toHaveBeenCalledTimes(1);

    player.play(1, clip(1, 1), RATE);
    player.finish();
    advance(5000);
    expect(startedOrder()).toEqual([0]);
    expect(onSentence).toHaveBeenCalledTimes(1);
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it("carries on when the next sentence arrives just inside stallMs", () => {
    const { player, advance, onStall, startedOrder } = setup();
    player.expect(0);
    player.expect(1);
    player.play(0, clip(1, 0), RATE);
    advance(1000 + STALL_MS - 100);
    player.play(1, clip(1, 1), RATE);
    advance(5000);
    expect(onStall).not.toHaveBeenCalled();
    expect(startedOrder()).toEqual([0, 1]);
  });

  it("does not stall while the audio already queued is still playing", () => {
    const { player, advance, onStall, startedOrder } = setup();
    player.expect(0);
    player.expect(1);
    player.play(0, clip(10, 0), RATE);
    advance(9000); // far longer than stallMs, but sentence 0 is still speaking
    expect(onStall).not.toHaveBeenCalled();
    player.play(1, clip(1, 1), RATE);
    expect(startedOrder()).toEqual([0, 1]);
  });

  it("starts counting from the moment a late sentence is sent when the player was idle", () => {
    const { player, advance, onStall } = setup();
    player.expect(0);
    player.play(0, clip(1, 0), RATE);
    advance(5000); // idle, nothing awaited
    player.expect(1);
    advance(STALL_MS - 100);
    expect(onStall).not.toHaveBeenCalled();
    advance(200);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("gives up when sentence 0 has no audio within firstAudioMs", () => {
    const { player, advance, onStall } = setup();
    player.expect(0);
    advance(FIRST_AUDIO_MS - 10);
    expect(onStall).not.toHaveBeenCalled();
    advance(20);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("does not give up on the first sentence once its audio arrives in time", () => {
    const { player, advance, onStall } = setup();
    player.expect(0);
    advance(FIRST_AUDIO_MS - 500);
    player.play(0, clip(30, 0), RATE);
    advance(FIRST_AUDIO_MS * 2);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("uses the stall limits it is given", () => {
    const { player, advance, onStall } = setup({ firstAudioMs: 500, stallMs: 300 });
    player.expect(0);
    player.expect(1);
    advance(490);
    expect(onStall).not.toHaveBeenCalled();
    advance(20);
    expect(onStall).toHaveBeenCalledTimes(1);

    const second = setup({ firstAudioMs: 500, stallMs: 300 });
    second.player.expect(0);
    second.player.expect(1);
    second.player.play(0, clip(1, 0), RATE);
    second.advance(1000 + 290);
    expect(second.onStall).not.toHaveBeenCalled();
    second.advance(20);
    expect(second.onStall).toHaveBeenCalledTimes(1);
  });
});

describe("createReplyPlayer: stop", () => {
  it("stops what is playing, ignores later audio and fires nothing more", () => {
    const { player, sources, advance, onSentence, onDone, onStall, startedOrder } = setup();
    player.expect(0);
    player.expect(1);
    player.expect(2);
    player.play(0, clip(1, 0), RATE);
    player.play(1, clip(1, 1), RATE); // queued behind 0, its highlight still pending
    advance(500);
    expect(onSentence).toHaveBeenCalledTimes(1);

    player.stop();
    expect(sources.filter((s) => s.startedAt !== null).every((s) => s.stopped)).toBe(true);

    player.play(2, clip(1, 2), RATE);
    player.finish();
    advance(60000);
    expect(startedOrder()).toEqual([0, 1]);
    expect(onSentence).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(onStall).not.toHaveBeenCalled();
  });

  it("cancels the wait for audio that never came", () => {
    const { player, advance, onStall } = setup();
    player.expect(0);
    player.stop();
    advance(FIRST_AUDIO_MS * 2);
    expect(onStall).not.toHaveBeenCalled();
  });

  it("ignores a sentence that arrives after stop", () => {
    const { player, sources, advance, onSentence } = setup();
    player.expect(0);
    player.stop();
    player.play(0, clip(1, 0), RATE);
    advance(2000);
    expect(sources).toHaveLength(0);
    expect(onSentence).not.toHaveBeenCalled();
  });

  it("does not report done for a source that ends after stop", () => {
    const { player, sources, onDone } = setup();
    player.expect(0);
    player.play(0, clip(1, 0), RATE);
    player.finish();
    player.stop();
    sources[0].onended?.(new Event("ended")); // browsers fire this after stop()
    expect(onDone).not.toHaveBeenCalled();
  });
});
