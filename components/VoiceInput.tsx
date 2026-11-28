"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createHearing,
  rms,
  CLIP_BITS_PER_SECOND,
  MAX_CLIP_BYTES,
  MAX_CLIP_SECONDS,
  MIN_CLIP_BYTES,
  VOICE_PROBLEMS,
  audioExtension,
  clipClock,
  micProblem,
  pickRecordingType,
  transcribeProblem,
  type VoiceProblem,
} from "@/lib/voice-input";

// ---------------------------------------------------------------------------
// The microphone in Ask Titus (mock: the "Ask Titus · microphone states" canvas).
// Tap the mic, speak, tap Stop (or it stops at a minute); the clip goes to
// /api/transcribe and the words land in the input box, to fix and send.
// Nothing is sent to the chat by itself.
// ---------------------------------------------------------------------------

export type VoiceState = "idle" | "recording" | "transcribing";

/** Whether a browser can record never changes while the page is open: nothing to subscribe to. */
const noSubscribe = () => () => {};

/** Whether this browser can record at all (no mic button where it can't: an old browser, or plain http). */
export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/**
 * Opens the mic with the browser's automatic gain control off and noise suppression on. Gain control turns the mic
 * up whenever the visitor goes quiet, which pushes a fan's hum back up toward speech level in every pause (so the
 * pause is never heard); noise suppression removes steady noise like fans before we measure it. A browser that
 * can't honour those settings (OverconstrainedError, or a TypeError for the constraint object) gets one retry
 * with plain `{ audio: true }`; any other error is the caller's, as before.
 */
async function getMic(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: false, noiseSuppression: true, echoCancellation: true },
    });
  } catch (error) {
    const name = error instanceof Error || (typeof DOMException !== "undefined" && error instanceof DOMException) ? (error as Error).name : "";
    if (name !== "OverconstrainedError" && !(error instanceof TypeError)) throw error;
    return navigator.mediaDevices.getUserMedia({ audio: true });
  }
}

/**
 * Records one clip at a time and transcribes it. `onText` gets the words; `problem` says why it stopped short.
 * `cancel` drops a clip in progress (the drawer closing): nothing is sent.
 */
export function useVoiceInput(onText: (text: string) => void) {
  const [state, setState] = useState<VoiceState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [problem, setProblem] = useState<VoiceProblem | null>(null);
  // True once the mic's loudness is coming through, so a pause will end the recording (and the hint can say so).
  const [autoStop, setAutoStop] = useState(false);
  // False on the server and in the first client render, so the two agree; then whether this browser can record.
  const supported = useSyncExternalStore(noSubscribe, canRecord, () => false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const limitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Bumped by every start and cancel: a start still waiting on the browser's permission prompt checks it, so a
  // drawer closed during the prompt never ends up with a recording nobody can stop.
  const generationRef = useRef(0);
  const startingRef = useRef(false);
  // The loudness watch: the audio graph, the timer that reads it, and the dot that grows with your voice.
  const audioRef = useRef<{ ctx: AudioContext; timer: ReturnType<typeof setInterval> } | null>(null);
  const meterRef = useRef<HTMLSpanElement | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  const clearTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (limitRef.current) clearTimeout(limitRef.current);
    tickRef.current = null;
    limitRef.current = null;
  };

  // Refs only, so these never change between renders.
  const releaseMic = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (audio) {
      clearInterval(audio.timer);
      void audio.ctx.close().catch(() => {});
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const transcribe = useCallback(async (clip: Blob) => {
    if (clip.size < MIN_CLIP_BYTES) {
      setProblem("silent");
      setState("idle");
      return;
    }
    // Over what the route takes (a browser recording at a higher bitrate than asked): say so, without sending.
    if (clip.size > MAX_CLIP_BYTES) {
      setProblem("too_long");
      setState("idle");
      return;
    }
    setState("transcribing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const body = new FormData();
      body.append("audio", clip, `clip.${audioExtension(clip.type) ?? "webm"}`);
      const res = await fetch("/api/transcribe", { method: "POST", body, signal: controller.signal });
      if (!res.ok) {
        setProblem(transcribeProblem(res.status));
        return;
      }
      const data = (await res.json()) as { text?: unknown };
      const text = typeof data.text === "string" ? data.text.trim() : "";
      if (!text) setProblem("empty");
      else onTextRef.current(text);
    } catch (error) {
      if (!(error instanceof Error && error.name === "AbortError")) setProblem("failed");
    } finally {
      abortRef.current = null;
      setState("idle");
    }
  }, []);

  const stop = useCallback(() => {
    clearTimers();
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorderRef.current || startingRef.current) return;
    const generation = ++generationRef.current;
    startingRef.current = true;
    setProblem(null);
    setAutoStop(false);
    // The loudness graph's context is made here, still inside the tap (before any await): Safari keeps a context
    // made later suspended, and it would hear nothing.
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      void ctx.resume().catch(() => {});
    } catch {
      ctx = null;
    }
    const dropContext = () => void ctx?.close().catch(() => {});
    let stream: MediaStream;
    try {
      stream = await getMic();
    } catch (error) {
      dropContext();
      // A cancelled start says nothing, and leaves a newer start's flag alone.
      if (generation === generationRef.current) {
        startingRef.current = false;
        setProblem(micProblem(error));
      }
      return;
    }
    // Cancelled while the prompt was up (the drawer closed): hand the mic straight back, record nothing.
    if (generation !== generationRef.current) {
      dropContext();
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    startingRef.current = false;
    streamRef.current = stream;
    const type = pickRecordingType((t) => MediaRecorder.isTypeSupported?.(t) ?? false);
    let rec: MediaRecorder;
    try {
      const options: MediaRecorderOptions = { audioBitsPerSecond: CLIP_BITS_PER_SECOND };
      if (type) options.mimeType = type;
      rec = new MediaRecorder(stream, options);
    } catch {
      dropContext();
      releaseMic();
      setProblem("failed");
      return;
    }
    recorderRef.current = rec;
    chunksRef.current = [];
    cancelledRef.current = false;
    const startedAt = Date.now();
    // Whether the loudness is really coming through: not until a frame that isn't all zeros (a suspended context,
    // iOS's silent tap or a muted mic reads only zeros). Until then the visitor stops by hand and the clip is always
    // sent. The hearing starts its clock at that first real frame, so time spent at zero never counts as silence.
    let hearing: ReturnType<typeof createHearing> | null = null;
    let measured = false;
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      clearTimers();
      releaseMic();
      recorderRef.current = null;
      const clip = new Blob(chunksRef.current, { type: rec.mimeType || type || "audio/webm" });
      chunksRef.current = [];
      if (cancelledRef.current) {
        setState("idle");
        return;
      }
      // Never heard a voice: say so, and send nothing (a silent clip only comes back empty, and costs a call).
      if (measured && hearing && !hearing.heard()) {
        setProblem("silent");
        setState("idle");
        return;
      }
      void transcribe(clip);
    };
    try {
      rec.start();
    } catch {
      recorderRef.current = null;
      dropContext();
      releaseMic();
      setProblem("failed");
      return;
    }
    if (ctx) {
      try {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        ctx.createMediaStreamSource(stream).connect(analyser);
        const frame = new Float32Array(analyser.fftSize);
        const timer = setInterval(() => {
          analyser.getFloatTimeDomainData(frame);
          const level = rms(frame);
          if (!hearing) {
            if (level === 0) return;
            hearing = createHearing(Date.now());
            measured = true;
            setAutoStop(true);
          }
          const dot = meterRef.current;
          if (dot) dot.style.transform = `scale(${1 + Math.min(1, level / 0.08) * 1.25})`;
          const heard = hearing.hear(level, Date.now());
          if (heard === "done" || heard === "nothing") stop();
        }, 50);
        audioRef.current = { ctx, timer };
      } catch {
        // No loudness here: fall back to the Stop button and the minute's limit.
        dropContext();
      }
    }
    setSeconds(0);
    setState("recording");
    tickRef.current = setInterval(() => setSeconds(Math.floor((Date.now() - startedAt) / 1000)), 250);
    limitRef.current = setTimeout(() => {
      setSeconds(MAX_CLIP_SECONDS);
      stop();
    }, MAX_CLIP_SECONDS * 1000);
  }, [stop, transcribe, releaseMic]);

  const cancel = useCallback(() => {
    generationRef.current += 1;
    // A tap after reopening the drawer asks again, even while an older prompt is still on screen.
    startingRef.current = false;
    cancelledRef.current = true;
    abortRef.current?.abort();
    stop();
    releaseMic();
  }, [stop, releaseMic]);

  const clearProblem = useCallback(() => setProblem(null), []);

  // Leaving the page mid-clip: drop it and hand the mic back.
  useEffect(() => cancel, [cancel]);

  return {
    supported,
    state,
    seconds,
    problem: problem ? VOICE_PROBLEMS[problem] : null,
    autoStop,
    meterRef,
    clearProblem,
    start,
    stop,
    cancel,
  };
}

const MicIcon = () => (
  <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
    <line x1="12" y1="18" x2="12" y2="22" />
  </svg>
);

/** The mic button between the box and Send. */
export const MicButton = ({
  onClick,
  disabled,
  buttonRef,
}: {
  onClick: () => void;
  disabled?: boolean;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) => (
  <button
    ref={buttonRef}
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label="Speak your question"
    title="Speak your question"
    className="flex h-[38px] w-10 flex-shrink-0 items-center justify-center border border-ink bg-paper text-ink transition-colors hover:border-amber hover:text-amber disabled:cursor-not-allowed disabled:opacity-40"
  >
    <MicIcon />
  </button>
);

/** Stands in for the box while recording ("Listening 0:07 / 1:00") or transcribing (the three dots). */
export const VoiceStatus = ({
  state,
  seconds,
  meterRef,
  autoStop = false,
  focusRef,
}: {
  state: Exclude<VoiceState, "idle">;
  seconds: number;
  meterRef?: React.Ref<HTMLSpanElement>;
  /** Whether a pause ends the recording here, so the hint is true. */
  autoStop?: boolean;
  /** Holds keyboard focus while transcribing, when no button is left to hold it. */
  focusRef?: React.Ref<HTMLDivElement>;
}) =>
  state === "recording" ? (
    // Only "Listening" is announced: the clock changing every second would talk over the visitor.
    <div
      role="status"
      className="flex min-h-[36px] min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 border border-amber bg-paper px-3 py-2 font-mono text-[12.5px] text-ink"
    >
      {/* Grows with your voice, so you can see it hears you. */}
      <span ref={meterRef} aria-hidden="true" className="h-2 w-2 rounded-full bg-amber transition-transform duration-75" />
      <span>Listening</span>
      {autoStop && <span className="text-[10.5px] italic text-ink-faint">pause when you&rsquo;re done</span>}
      <span aria-hidden="true" className="ml-auto text-ink-soft">
        {clipClock(seconds)}
      </span>
    </div>
  ) : (
    <div
      ref={focusRef}
      // In the drawer's Tab order for the second or two it shows, so Tab from it stays inside the drawer.
      tabIndex={0}
      role="status"
      className="flex min-h-[36px] min-w-0 flex-1 items-center gap-1.5 border border-rule bg-paper px-3 py-2 focus:outline-none focus-visible:border-amber focus-visible:ring-2 focus-visible:ring-amber/40"
    >
      <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-bounce" style={{ animationDelay: "0ms", animationDuration: "900ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-bounce" style={{ animationDelay: "180ms", animationDuration: "900ms" }} />
      <span className="h-1.5 w-1.5 rounded-full bg-amber motion-safe:animate-bounce" style={{ animationDelay: "360ms", animationDuration: "900ms" }} />
      <span className="ml-1.5 font-mono text-[10.5px] italic tracking-[0.02em] text-ink-faint">Transcribing…</span>
    </div>
  );

/** Ends the recording; the clip then goes to be transcribed. */
export const StopRecordingButton = ({
  onClick,
  buttonRef,
}: {
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) => (
  <button
    ref={buttonRef}
    type="button"
    onClick={onClick}
    className="flex flex-shrink-0 items-center gap-1.5 border border-amber bg-amber px-3.5 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-paper transition-colors hover:border-ink hover:bg-ink"
    aria-label="Stop recording"
  >
    <span aria-hidden="true" className="h-2 w-2 bg-current" />
    <span>Stop</span>
  </button>
);
