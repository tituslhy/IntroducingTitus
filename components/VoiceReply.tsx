"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DOWNLOAD_MB, MODEL_FILE_URL } from "@/lib/voice-reply/config";
import { getVoiceEngine, type SpokenAudio } from "@/lib/voice-reply/engine";
import { clearHighlight, highlightSentence } from "@/lib/voice-reply/highlight";
import { createReplyPlayer, type PlayerContext, type ReplyPlayer } from "@/lib/voice-reply/player";
import { speakableSentences, type Sentence } from "@/lib/voice-reply/speakable";
import { canSpeak, isVoiceCached, needsDownloadOffer } from "@/lib/voice-reply/support";

// ---------------------------------------------------------------------------
// Voice reply in Ask Titus (spec: docs/superpowers/specs/2026-11-28-voice-reply-design.md; mocks in
// .superpowers/sdd/2026-11-28-voice-reply/mock). A question the visitor spoke is answered out loud by Kokoro in
// their browser, as the reply streams in; typed questions stay silent. The hook below is the whole state machine;
// the components after it are the drawer's pieces of it.
// ---------------------------------------------------------------------------

/** How long after a reply finishes the voice may still start reading it by itself (the spec's "8 s" rule). */
export const LATE_MS = 8000;

export type VoicePhase = "offer" | "loading" | "speaking" | "late" | "done" | "failed";

export interface VoiceReplyStatus {
  /** The reply this is about (the assistant message's id); "" for an offer made before any question. */
  key: string;
  phase: VoicePhase;
  /** Download progress in whole percent, never going backwards. */
  progress: number;
  /** Megabytes downloaded so far, out of DOWNLOAD_MB. */
  loadedMb: number;
  /** The voice is downloading for the first time (not from the browser's cache): show the first-time step. */
  firstTime: boolean;
}

export interface VoiceReply {
  /**
   * Call inside the visitor's tap. At the mic tap (`recording: true`) it only starts the download (or the phone's
   * offer); at Send, "hear again" and "Hear this reply" it also readies the audio (see primeAudio).
   */
  prime(opts?: { recording?: boolean }): void;
  /** A spoken question was sent; its reply will have this key. */
  begin(replyKey: string): void;
  /** The reply so far (the whole markdown, not a delta). */
  feed(markdown: string): void;
  /** The reply is all in. */
  finish(markdown: string): void;
  /** Stop speaking now (Stop, typing, the mic, Send, closing the drawer, the tour, a stream error). */
  stop(): void;
  hearAgain(replyKey: string): void;
  status: VoiceReplyStatus | null;
  answerOffer(yes: boolean): void;
  /** "Just read": no speech for this reply (the download carries on for next time). */
  justRead(): void;
  /** The visitor typed, tapped the mic or scrolled the drawer (for the 8 s rule). */
  noteInteraction(): void;
  /** Whether this browser may speak at all (WebGPU, and the voice hasn't failed this visit). */
  supported: boolean;
}

/** What the drawer shows, minus the download numbers (kept apart so progress doesn't rebuild everything). */
interface View {
  key: string;
  phase: VoicePhase;
  firstTime: boolean;
}

interface Env {
  /** WebGPU gives an adapter. */
  speak: boolean;
  /** The model is in the browser's cache. */
  cached: boolean;
  /** Ask before downloading (a phone, mobile data or Save-Data). */
  offer: boolean;
}

/** The spoken reply in hand: the last one only (its audio is kept for "hear again", for this visit). */
interface Reply {
  key: string;
  markdown: string;
  finished: boolean;
  finishedAt: number;
  /** Typed, tapped the mic or scrolled since the reply finished. */
  interacted: boolean;
  /** Stopped (the drawer closed) while the voice was still coming: never start talking by itself. */
  noAuto: boolean;
  /** How many sentences the current playback has sent to the engine. */
  sent: number;
  /** Each sentence as shown, by index, to highlight it. */
  shown: string[];
  audio: Map<number, SpokenAudio>;
}

type Mode =
  | "idle" // nothing for this reply (typed, "Text is fine", "Just read", dismissed)
  | "pending" // checking the browser
  | "offer" // waiting on the phone's offer
  | "loading" // waiting on the download
  | "speaking"
  | "stopped" // stopped mid-stream; becomes "done" once the reply is in
  | "late"
  | "done"
  | "failed";

interface UI {
  view(view: View | null): void;
  progress(fraction: number): void;
  noVoice(): void;
}

/**
 * A reply that ends in a full stop may not be done with that sentence: "etc." can become "etc. and so on", "Fig."
 * "Fig. 2 shows". Its last sentence waits for one more character (or the end of the reply). Costs a token of delay.
 */
const TRAILING_STOP = /\.["”’')\]*_`]*\s*$/;

const ABORT = "AbortError";

function createController(ui: UI) {
  let reply: Reply | null = null;
  let mode: Mode = "idle";
  let phase: VoicePhase | null = null;
  let firstTime = false;
  // Bumped by every begin, stop and replay: anything async from before checks it and drops itself.
  let gen = 0;
  let player: ReplyPlayer | null = null;
  let ctx: AudioContext | null = null;
  let env: Promise<Env> | null = null;
  /** The browser check's answer, once it is in, so later questions decide at once (no flash of the wrong line). */
  let known: Env | null = null;
  let loading: Promise<void> | null = null;
  let maxFraction = 0;
  let voiceFailed = false;
  let offerOpen = false;
  let accepted = false;
  let declined = false;

  const engine = () => getVoiceEngine();

  function publish() {
    if (offerOpen) ui.view({ key: reply?.key ?? "", phase: "offer", firstTime: false });
    else ui.view(phase && reply ? { key: reply.key, phase, firstTime } : null);
  }

  function setMode(next: Mode, shown: VoicePhase | null) {
    mode = next;
    phase = shown;
    publish();
  }

  function checkEnv(): Promise<Env> {
    env ??= (async () => {
      const nav = typeof navigator === "undefined" ? undefined : navigator;
      const [speak, cached] = await Promise.all([
        // No @webgpu/types here: canSpeak only needs `gpu.requestAdapter`.
        nav ? canSpeak(nav as unknown as Parameters<typeof canSpeak>[0]) : Promise.resolve(false),
        isVoiceCached(typeof caches === "undefined" ? undefined : caches, MODEL_FILE_URL),
      ]);
      if (!speak) ui.noVoice();
      const coarsePointer =
        typeof window !== "undefined" && typeof window.matchMedia === "function"
          ? !!window.matchMedia("(pointer: coarse)")?.matches
          : false;
      const connection = (nav as (Navigator & { connection?: { type?: string; saveData?: boolean } }) | undefined)
        ?.connection;
      known = { speak, cached, offer: needsDownloadOffer({ coarsePointer, connection, cached }) };
      return known;
    })();
    return env;
  }

  /** The download, once per visit. Listens for progress before it starts (the engine doesn't replay it). */
  function startLoad(): Promise<void> {
    if (!loading) {
      const e = engine();
      e.onProgress((fraction) => {
        // The engine's fraction can dip when a new file's size arrives; the bar never goes backwards.
        if (fraction <= maxFraction) return;
        maxFraction = fraction;
        ui.progress(fraction);
      });
      loading = e.load();
      loading.then(
        () => ui.progress(1),
        () => {
          voiceFailed = true;
          ui.noVoice();
        }
      );
    }
    return loading;
  }

  /**
   * Readies the audio, inside the tap: iPhone Safari plays Web Audio as ambient sound, which the silent switch mutes,
   * unless the session says "playback"; and Safari only plays audio from a context a tap made or resumed (a
   * suspended one hangs quietly). Not during the mic's recording, where a "playback" session could cost the mic.
   */
  function primeAudio() {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) {
      try {
        session.type = "playback";
      } catch {
        // An older Safari that rejects the type: play anyway.
      }
    }
    try {
      if (!ctx || ctx.state === "closed") ctx = new AudioContext();
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    } catch {
      ctx = null;
    }
  }

  /** Stops whatever is playing and drops everything queued, so nothing from before can play. */
  function halt() {
    gen += 1;
    if (player) {
      player.stop();
      player = null;
    }
    // Nothing can be queued before the download started (speech only begins once the voice is ready).
    if (loading) engine().cancelAll();
    clearHighlight();
  }

  function fail() {
    if (player) {
      player.stop();
      player = null;
    }
    engine().cancelAll();
    clearHighlight();
    setMode("failed", "failed");
  }

  function send(r: Reply, p: ReplyPlayer, s: Sentence) {
    r.shown[s.index] = s.shown;
    p.expect(s.index);
    const kept = r.audio.get(s.index);
    if (kept) {
      p.play(s.index, kept.audio, kept.sampleRate);
      return;
    }
    const { audio } = engine().speak(s.spoken);
    audio.then(
      (made) => {
        if (reply !== r) return;
        r.audio.set(s.index, made);
        if (player === p) p.play(s.index, made.audio, made.sampleRate);
      },
      (error: Error) => {
        // A cancelled sentence (stop, a new question) is expected; anything else means the voice gave out.
        if (player !== p || error?.name === ABORT) return;
        fail();
      }
    );
  }

  /** Sends the sentences that are ready and haven't been sent; with `final`, the rest too, and says that's all. */
  function flush(final: boolean) {
    const r = reply;
    const p = player;
    if (!r || !p || mode !== "speaking") return;
    const all = speakableSentences(r.markdown, { final });
    const ready = !final && all.length > 0 && TRAILING_STOP.test(r.markdown) ? all.slice(0, -1) : all;
    for (let i = r.sent; i < ready.length && player === p; i++) send(r, p, ready[i]);
    r.sent = Math.max(r.sent, ready.length);
    if (final && player === p) p.finish();
  }

  /** Plays the reply from its first sentence, on a fresh player. */
  function startSpeaking() {
    const r = reply;
    if (!r) return;
    if (!ctx) {
      // Not primed by a tap (shouldn't happen): try anyway; the player's timers catch a context that never plays.
      try {
        ctx = new AudioContext();
        void ctx.resume().catch(() => {});
      } catch {
        ctx = null;
      }
    }
    if (!ctx) return fail();
    const p = createReplyPlayer(ctx as unknown as PlayerContext, {
      onSentence: (index) => {
        if (player !== p) return;
        highlightSentence(document.getElementById(`copilot-msg-${r.key}`), r.shown[index] ?? "");
      },
      onDone: () => {
        if (player !== p) return;
        p.stop();
        player = null;
        clearHighlight();
        setMode("done", "done");
      },
      onStall: () => {
        if (player !== p) return;
        fail();
      },
    });
    player = p;
    r.sent = 0;
    setMode("speaking", "speaking");
    flush(r.finished);
  }

  /** The voice has arrived for a reply that was waiting on it. */
  function onReady() {
    const r = reply;
    if (!r) return;
    firstTime = false;
    const late = r.noAuto || (r.finished && (r.interacted || Date.now() - r.finishedAt > LATE_MS));
    if (late) setMode("late", "late");
    else startSpeaking();
  }

  /** What a spoken question's reply does, once the browser has been checked. */
  function decide(e: Env) {
    if (!reply) return;
    const state = engine().state;
    if (!e.speak || voiceFailed || state === "failed") return setMode("failed", "failed");
    if (declined) return setMode("idle", null);
    if (state === "ready") return startSpeaking();
    if (e.offer && !accepted) {
      offerOpen = true;
      return setMode("offer", null);
    }
    firstTime = !e.cached;
    setMode("loading", "loading");
    const g = gen;
    startLoad().then(
      () => g === gen && onReady(),
      () => g === gen && setMode("failed", "failed")
    );
  }

  return {
    prime(opts?: { recording?: boolean }) {
      if (!opts?.recording) primeAudio();
      void checkEnv().then((e) => {
        if (!e.speak || voiceFailed) return;
        if (e.offer && !accepted) {
          if (!declined && !offerOpen) {
            offerOpen = true;
            publish();
          }
          return;
        }
        void startLoad().catch(() => {});
      });
    },

    begin(key: string) {
      halt();
      reply = {
        key,
        markdown: "",
        finished: false,
        finishedAt: 0,
        interacted: false,
        noAuto: false,
        sent: 0,
        shown: [],
        audio: new Map(),
      };
      firstTime = false;
      if (known) return decide(known);
      // Shown as waiting while the browser is checked (a few ms); the thinking line says it will answer out loud.
      setMode("pending", "loading");
      const g = gen;
      void checkEnv().then((e) => g === gen && decide(e));
    },

    feed(markdown: string) {
      if (!reply) return;
      reply.markdown = markdown;
      flush(false);
    },

    finish(markdown: string) {
      const r = reply;
      if (!r || r.finished) return;
      r.markdown = markdown;
      r.finished = true;
      r.finishedAt = Date.now();
      if (mode === "speaking") flush(true);
      else if (mode === "stopped") setMode("done", "done");
    },

    stop() {
      const r = reply;
      if (!r) return;
      if (mode === "speaking") {
        halt();
        if (r.finished) setMode("done", "done");
        else setMode("stopped", null);
      } else if (mode === "pending" || mode === "offer" || mode === "loading") {
        // Nothing is playing yet: when the voice comes, it offers the reply rather than starting by itself.
        r.noAuto = true;
      } else if (mode === "late") {
        setMode("idle", null);
      }
    },

    hearAgain(key: string) {
      const r = reply;
      if (!r || r.key !== key || !r.finished) return;
      primeAudio();
      halt();
      startSpeaking();
    },

    answerOffer(yes: boolean) {
      offerOpen = false;
      if (yes) accepted = true;
      else declined = true;
      if (yes) void startLoad().catch(() => {});
      if (reply && mode === "offer") {
        if (yes) {
          const g = gen;
          void checkEnv().then((e) => g === gen && decide(e));
        } else {
          setMode("idle", null);
        }
      }
      publish();
    },

    justRead() {
      if (!reply) return;
      halt();
      setMode("idle", null);
    },

    noteInteraction() {
      if (reply?.finished) reply.interacted = true;
    },

    dispose() {
      halt();
    },
  };
}

/** WebGPU's presence never changes while the page is open: nothing to subscribe to. */
const noSubscribe = () => () => {};
const hasGpu = () => typeof navigator !== "undefined" && "gpu" in navigator;

export function useVoiceReply(): VoiceReply {
  const gpu = useSyncExternalStore(noSubscribe, hasGpu, () => false);
  const [noVoice, setNoVoice] = useState(false);
  const [view, setView] = useState<View | null>(null);
  const [download, setDownload] = useState({ progress: 0, loadedMb: 0 });
  const [ctl] = useState(() =>
    createController({
      view: setView,
      progress: (fraction) => {
        const progress = Math.floor(fraction * 100);
        const loadedMb = Math.round(fraction * DOWNLOAD_MB);
        setDownload((prev) => (prev.progress === progress && prev.loadedMb === loadedMb ? prev : { progress, loadedMb }));
      },
      noVoice: () => setNoVoice(true),
    })
  );
  useEffect(() => () => ctl.dispose(), [ctl]);

  const status = useMemo(() => (view ? { ...view, ...download } : null), [view, download]);
  return useMemo(
    () => ({
      prime: ctl.prime,
      begin: ctl.begin,
      feed: ctl.feed,
      finish: ctl.finish,
      stop: ctl.stop,
      hearAgain: ctl.hearAgain,
      answerOffer: ctl.answerOffer,
      justRead: ctl.justRead,
      noteInteraction: ctl.noteInteraction,
      status,
      supported: gpu && !noVoice,
    }),
    [ctl, status, gpu, noVoice]
  );
}

// ---- The drawer's pieces ----

const MicGlyph = () => (
  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
  </svg>
);

const SpeakerIcon = ({ size = 12, className = "" }: { size?: number; className?: string }) => (
  <svg
    aria-hidden="true"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    <path d="M16.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

/** Beside "You" on a question the visitor spoke. */
export const SpokenTag = () => (
  <span className="inline-flex items-center gap-1 normal-case italic tracking-[0.04em]">
    <MicGlyph />
    spoken
  </span>
);

/** The download's progress: a thin amber bar. */
const DownloadBar = ({ progress }: { progress: number }) => (
  <div
    role="progressbar"
    aria-label="Voice download"
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={progress}
    className="h-[3px] bg-[oklch(0.88_0.012_78)]"
  >
    <div className="h-[3px] bg-amber" style={{ width: `${progress}%` }} />
  </div>
);

/**
 * Under the typing dots of a spoken question: it will answer out loud, and, the first time, the real download.
 * Only the step's name is announced: a number changing every second would talk over everything else.
 */
export const ThinkingVoiceLine = ({ download }: { download?: { progress: number; loadedMb: number } | null }) => (
  <div className="ml-[15px] mt-1 flex flex-col gap-1.5">
    <p className="m-0 flex items-center gap-1.5 font-mono text-[10.5px] italic text-ink-soft">
      <SpeakerIcon className="flex-shrink-0 text-amber" />
      <span>You asked out loud, so I’ll answer out loud.</span>
    </p>
    {download && (
      <div className="flex flex-col gap-[7px] border border-rule bg-paper-deep px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-2.5">
          <span role="status" className="font-mono text-[11.5px] text-ink">
            Getting my voice ready
          </span>
          <span className="font-mono text-[11px] text-ink-soft">{download.progress}%</span>
        </div>
        <DownloadBar progress={download.progress} />
        <p className="m-0 font-mono text-[10.5px] leading-[1.45] text-ink-faint">
          First time only: {download.loadedMb} of {DOWNLOAD_MB} MB. Your browser keeps it, so next time I answer straight
          away.
        </p>
      </div>
    )}
  </div>
);

const BAR_DELAYS_MS = [0, 220, 440, 110, 330];

/** Filled buttons flip their background on hover: no colour transition, which would fade through grey. */
const FILLED_BUTTON =
  "flex flex-shrink-0 items-center gap-1.5 border border-amber bg-amber px-3 py-[7px] font-mono text-[11px] uppercase text-paper hover:border-ink hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber max-[640px]:min-h-[44px]";

/**
 * Above the input row while a spoken reply is on: speaking (with Stop), waiting for the first download (with Just
 * read), or ready too late to start by itself (with Hear this reply). It wraps on a phone.
 */
export const SpeakingStrip = ({
  phase,
  progress,
  still,
  onStop,
  onJustRead,
  onHear,
  onDismiss,
}: {
  phase: "speaking" | "loading" | "late";
  progress: number;
  /** Reduced motion: the bars stand still. */
  still: boolean;
  onStop: () => void;
  onJustRead: () => void;
  onHear: () => void;
  onDismiss: () => void;
}) => {
  if (phase === "speaking") {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 border border-amber bg-paper py-[5px] pl-3 pr-[5px]">
        <span data-voice-bars aria-hidden="true" className="flex h-3.5 items-center gap-0.5">
          {BAR_DELAYS_MS.map((delay) => (
            <span
              key={delay}
              className={`voice-bar h-3.5 w-0.5 bg-amber${still ? "" : " voice-bar-move"}`}
              style={still ? undefined : { animationDelay: `${delay}ms` }}
            />
          ))}
        </span>
        <span role="status" className="font-mono text-[12.5px] text-ink">
          Speaking
        </span>
        <span className="font-mono text-[10.5px] italic text-ink-faint">type to cut in</span>
        <button type="button" onClick={onStop} aria-label="Stop speaking" className={`ml-auto tracking-[0.1em] ${FILLED_BUTTON}`}>
          <span aria-hidden="true" className="h-2 w-2 bg-current" />
          <span>Stop</span>
        </button>
      </div>
    );
  }
  if (phase === "loading") {
    return (
      <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-2 border border-rule bg-paper py-1.5 pl-3 pr-1.5">
        <div className="flex min-w-[150px] flex-1 flex-col gap-[5px]">
          <span className="font-mono text-[12px] text-ink">
            <span role="status">Getting my voice ready</span> · {progress}%
          </span>
          <DownloadBar progress={progress} />
          <span className="font-mono text-[10.5px] italic text-ink-faint">I’ll read it out as soon as it’s in.</span>
        </div>
        <button
          type="button"
          onClick={onJustRead}
          className="flex-shrink-0 border border-ink bg-paper px-2.5 py-[7px] font-mono text-[11px] uppercase tracking-[0.06em] text-ink hover:bg-ink hover:text-paper focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber max-[640px]:min-h-[44px]"
        >
          Just read
        </button>
      </div>
    );
  }
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-2.5 gap-y-2 border border-amber bg-paper py-[5px] pl-3 pr-[5px]">
      <span role="status" className="min-w-[140px] flex-1 font-mono text-[12px] text-ink">
        My voice is ready.
      </span>
      <button type="button" onClick={onHear} className={`tracking-[0.08em] ${FILLED_BUTTON}`}>
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
          <path d="M6 4l14 8-14 8z" />
        </svg>
        <span>Hear this reply</span>
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 p-1.5 text-ink-faint transition-colors hover:text-amber max-[640px]:p-3"
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
};

/** The phone's question at the first mic tap (the recording carries on underneath). */
export const DownloadOffer = ({ onAnswer }: { onAnswer: (yes: boolean) => void }) => (
  <div role="group" aria-label="Spoken replies" className="mb-2.5 flex flex-col gap-2.5 border border-rule bg-paper px-3.5 py-3">
    <p className="m-0 flex items-start gap-2 font-serif text-[14.5px] leading-[1.45] text-ink">
      <SpeakerIcon size={14} className="mt-1 flex-shrink-0 text-amber" />
      <span>I can answer out loud. It’s a one-off {DOWNLOAD_MB} MB download, best on Wi-Fi.</span>
    </p>
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onAnswer(true)}
        className="min-h-[44px] min-w-[130px] flex-1 border border-amber bg-amber font-mono text-[11px] uppercase tracking-[0.08em] text-paper hover:border-ink hover:bg-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        Speak replies
      </button>
      <button
        type="button"
        onClick={() => onAnswer(false)}
        className="min-h-[44px] min-w-[130px] flex-1 border border-ink bg-paper font-mono text-[11px] uppercase tracking-[0.08em] text-ink hover:bg-paper-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber"
      >
        Text is fine
      </button>
    </div>
  </div>
);

/** Beside "copy" on the last spoken reply, once it has been read out: plays it again from the start. */
export const HearAgainButton = ({ onClick }: { onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label="Hear this reply again"
    title="Hear again"
    className="flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-amber transition-colors hover:text-ink"
  >
    <SpeakerIcon size={11} />
    <span>hear again</span>
  </button>
);

/** Under a spoken question's reply when the voice couldn't do it. */
export const VoiceFallbackLine = () => (
  <p role="status" className="mt-2 font-serif text-[13px] italic leading-[1.4] text-[oklch(0.52_0.14_55)]">
    My voice couldn’t keep up on this device, so this one’s written out.
  </p>
);
