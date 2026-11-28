/**
 * Plays a spoken reply's sentences back to back. The engine makes them one at a time and they may
 * arrive out of order or late; this queues each on the audio clock in index order, tells the
 * drawer which sentence is being spoken, and gives up when the voice cannot keep up. No React and
 * no global `AudioContext`: the drawer creates the context inside a tap and passes it in.
 */

/** How long to wait for the next sentence once the last one has finished speaking. */
export const STALL_MS = 2000;
/** How long to wait for the very first sentence, which includes loading the voice. */
export const FIRST_AUDIO_MS = 8000;

/** The slice of the browser's `AudioContext` the player uses, so tests can pass a fake. */
export interface PlayerContext {
  readonly currentTime: number;
  readonly destination: unknown;
  createBuffer(
    numberOfChannels: number,
    length: number,
    sampleRate: number,
  ): { readonly duration: number; getChannelData(channel: number): Float32Array };
  createBufferSource(): {
    buffer: { readonly duration: number; getChannelData(channel: number): Float32Array } | null;
    onended: ((ev: Event) => void) | null;
    connect(destination: never): unknown;
    start(when?: number): void;
    stop(): void;
  };
}

export interface ReplyPlayerOptions {
  /** Sentence `index` has just started playing. */
  onSentence(index: number): void;
  /** Every sentence has been spoken and the reply is complete. */
  onDone(): void;
  /** The voice could not keep up; nothing more will play. */
  onStall(): void;
  stallMs?: number;
  firstAudioMs?: number;
  /** Wall clock in ms, injectable for tests. */
  now?: () => number;
}

export interface ReplyPlayer {
  /** A sentence was sent to the engine, so its audio is awaited. */
  expect(index: number): void;
  /** The engine returned audio for a sentence. */
  play(index: number, audio: Float32Array, sampleRate: number): void;
  /** No more sentences will be sent. */
  finish(): void;
  /** Silence everything and ignore whatever arrives later. */
  stop(): void;
}

export function createReplyPlayer(ctx: PlayerContext, opts: ReplyPlayerOptions): ReplyPlayer {
  const stallMs = opts.stallMs ?? STALL_MS;
  const firstAudioMs = opts.firstAudioMs ?? FIRST_AUDIO_MS;
  const now = opts.now ?? Date.now;

  /** Audio that has arrived but whose turn has not come. */
  const pending = new Map<number, { audio: Float32Array; sampleRate: number }>();
  const sources: { stop(): void }[] = [];
  const highlightTimers = new Set<ReturnType<typeof setTimeout>>();

  let expectedCount = 0; // sentences sent to the engine, as highest index + 1
  let nextIndex = 0; // the next sentence to put on the clock
  let nextStart = 0; // audio-clock time the next sentence may start
  let playing = 0; // queued sources that have not ended
  let finished = false;
  let stopped = false; // by the visitor; also set once we give up
  let done = false;

  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let waitStartedAt = 0;
  let waitLimit = 0;

  function clearWait() {
    if (waitTimer !== null) clearTimeout(waitTimer);
    waitTimer = null;
  }

  function giveUp() {
    if (stopped) return;
    stopped = true;
    clearWait();
    highlightTimers.forEach(clearTimeout);
    highlightTimers.clear();
    pending.clear();
    opts.onStall();
  }

  /**
   * Starts the stall clock when we are waiting on audio and nothing is speaking, so a long
   * sentence already queued never counts as a stall. Sentence 0 gets the longer limit because
   * the voice may still be loading.
   */
  function armWait() {
    if (stopped || waitTimer !== null || nextIndex >= expectedCount || playing > 0) return;
    waitLimit = nextIndex === 0 ? firstAudioMs : stallMs;
    waitStartedAt = now();
    waitTimer = setTimeout(giveUp, waitLimit);
  }

  function finishIfDone() {
    if (stopped || done || !finished || playing > 0 || nextIndex < expectedCount) return;
    done = true;
    opts.onDone();
  }

  function schedule(index: number, audio: Float32Array, sampleRate: number) {
    const buffer = ctx.createBuffer(1, audio.length, sampleRate);
    buffer.getChannelData(0).set(audio);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination as never);

    const when = Math.max(ctx.currentTime, nextStart);
    nextStart = when + buffer.duration;
    playing += 1;
    source.onended = () => {
      if (stopped) return;
      playing -= 1;
      armWait();
      finishIfDone();
    };
    source.start(when);
    sources.push(source);

    const timer = setTimeout(() => {
      highlightTimers.delete(timer);
      if (!stopped) opts.onSentence(index);
    }, Math.max(0, (when - ctx.currentTime) * 1000));
    highlightTimers.add(timer);
  }

  function drain() {
    for (let next = pending.get(nextIndex); next; next = pending.get(nextIndex)) {
      pending.delete(nextIndex);
      schedule(nextIndex, next.audio, next.sampleRate);
      nextIndex += 1;
    }
  }

  return {
    expect(index) {
      if (stopped) return;
      expectedCount = Math.max(expectedCount, index + 1);
      armWait();
    },

    play(index, audio, sampleRate) {
      if (stopped) return;
      // A timer held back by a busy page may not have fired yet; the clock still says we gave up.
      if (waitTimer !== null && now() - waitStartedAt > waitLimit) {
        giveUp();
        return;
      }
      if (index < nextIndex) return;
      expectedCount = Math.max(expectedCount, index + 1);
      pending.set(index, { audio, sampleRate });
      const before = nextIndex;
      drain();
      if (nextIndex > before) clearWait();
    },

    finish() {
      if (stopped) return;
      finished = true;
      finishIfDone();
    },

    stop() {
      stopped = true;
      clearWait();
      highlightTimers.forEach(clearTimeout);
      highlightTimers.clear();
      pending.clear();
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already ended; nothing to stop.
        }
      }
      sources.length = 0;
    },
  };
}
