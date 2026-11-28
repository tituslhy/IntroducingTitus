// ---------------------------------------------------------------------------
// Voice in for Ask Titus (drawer-plans/2. ask-titus-beyond-text.md, step 4):
// the visitor speaks, /api/transcribe turns the clip into words, and the words
// land in the input box to check before sending. Shared by the drawer and the
// route, so both hold the same limits.
// ---------------------------------------------------------------------------

/** Longest clip: recording stops itself here. */
export const MAX_CLIP_SECONDS = 60;
/**
 * Largest clip the route takes. A minute is about 0.25 MB at CLIP_BITS_PER_SECOND, and about 1 MB where a browser
 * ignores that and records AAC at 128 kbps (Safari). Kept just above that, since the cap also bounds how many
 * minutes a low-bitrate clip from a script can hold (about 25 at Opus's lowest).
 */
export const MAX_CLIP_BYTES = 1_100_000;
/**
 * The recording's bitrate: plenty for speech, and it keeps a minute near 0.25 MB (browsers that ignore it, like
 * Safari with AAC, still fit under MAX_CLIP_BYTES).
 */
export const CLIP_BITS_PER_SECOND = 32_000;
/** Smaller than this holds no speech worth sending (a tap on the button and nothing said). */
export const MIN_CLIP_BYTES = 1_000;
/** Longest transcript put in the box: the chat's own per-message limit. */
export const MAX_TRANSCRIPT_CHARS = 4_000;

/** Audio types the route accepts, by base type (codecs ignored), with the file extension OpenAI reads the format from. */
export const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  // Some browsers label an audio-only recording with its container's video type.
  "video/webm": "webm",
  "video/mp4": "mp4",
};

/** Recording formats to ask the browser for, best first: Opus where it exists, AAC on Safari. */
export const RECORDING_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

/** "audio/webm;codecs=opus" → "audio/webm". */
export function baseType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

/** The file extension for an audio type, or null when the route doesn't take it. */
export function audioExtension(type: string): string | null {
  return AUDIO_TYPES[baseType(type)] ?? null;
}

/** The first recording format this browser supports, or "" to let it choose its own. */
export function pickRecordingType(isTypeSupported: (type: string) => boolean): string {
  return RECORDING_TYPES.find((t) => isTypeSupported(t)) ?? "";
}

/** "0:07 / 1:00": seconds recorded, out of the limit. */
export function clipClock(seconds: number): string {
  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  return `${fmt(Math.min(seconds, MAX_CLIP_SECONDS))} / ${fmt(MAX_CLIP_SECONDS)}`;
}

// ---------------------------------------------------------------------------
// Hearing when the visitor has finished: the drawer measures the mic's loudness
// (RMS, 0 to 1) about twenty times a second and stops once they've spoken and
// then paused. If it never hears speech, nothing is sent at all.
// ---------------------------------------------------------------------------

/** Quietest loudness counted as speech; raised in a noisy room (see SPEECH_OVER_FLOOR). */
export const SPEECH_RMS = 0.01;
/** Speech is this many times louder than the room's quietest moment. */
export const SPEECH_OVER_FLOOR = 3;
/**
 * Loud enough to be speech however loud the room seemed: the room's level is its quietest moment so far, which is
 * speech itself when someone talks the instant the mic opens, so the bar it sets is capped here.
 */
export const LOUD_RMS = 0.04;
/**
 * A frame also has to stand out of the room: be at least this many times the room's quietest moment. A steady fan
 * above LOUD_RMS passes the bar above for ever, but it never gets this far over its own quietest moment, so on its
 * own it is not speech. A fan's jitter peaks about 1.16 times its quietest moment, and a visitor 1.33 times a loud
 * room (0.04 over 0.03) must still count, so the bar sits between the two. In a quiet room the bar above is already
 * the higher of the two.
 */
export const STANDS_OUT_OF_ROOM = 1.25;
/**
 * Once speech has been heard, a frame has to be past this fraction of the way from the room's level up to the
 * visitor's speaking level to count as speech again: a pause is closer to the room than to their voice. Measured
 * from the room, a fan that is loud but steady sits at the bottom. It is under half because the speaking level
 * only rises: a loud laugh or an emphasised word lifts it, and at a half the bar would then sit above their normal
 * voice, making the next sentence look like a pause.
 */
export const PAUSE_POINT = 0.35;
/**
 * The speaking level is a peak envelope over the frames counted as speech. It rises toward a louder frame (the gap
 * halves this often) so a single loud word mustn't make normal speech look like a pause, while a second of real
 * speech still sets the level. It never falls during a recording (a minute at most): a level that sank during a
 * pause would drag the bar down toward the fan, and the pause would never be heard.
 */
export const SPEECH_LEVEL_ATTACK_HALF_LIFE_MS = 250;
/** Speech for this long, in total, before it counts (a cough or a click doesn't). */
export const MIN_SPEECH_MS = 200;
/** A pause this long after speech means they've finished. */
export const END_PAUSE_MS = 1_300;
/** No speech at all for this long: stop and say so, without sending anything. */
export const NO_SPEECH_MS = 7_000;

export type Hearing = "waiting" | "speaking" | "pause" | "done" | "nothing";

/** Root mean square of one frame of samples (-1 to 1): how loud it is. */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * Follows one recording's loudness, frame by frame. `hear(level, now)` says whether they're speaking, pausing,
 * done (spoke, then paused for END_PAUSE_MS), or nothing (no speech in NO_SPEECH_MS). `heard()` says whether
 * speech was ever heard, for a recording stopped by hand.
 */
export function createHearing(startedAt: number) {
  let floor = Infinity;
  let speechMs = 0;
  let lastFrame = startedAt;
  let lastLoud: number | null = null;
  // The visitor's speaking level: a peak over the frames counted as speech that only rises (see SPEECH_LEVEL_ATTACK_HALF_LIFE_MS).
  let speakingLevel = 0;
  return {
    hear(level: number, now: number): Hearing {
      const frameMs = Math.max(0, now - lastFrame);
      lastFrame = now;
      // The room as it was before this frame: a frame can't stand out of itself, so the first frame (or a talker's
      // first word, as the mic opens) has no room to stand out of yet.
      const roomBefore = Number.isFinite(floor) ? floor : 0;
      // Exact silence (a muted or just-opened track) says nothing about the room.
      if (level > 0) floor = Math.min(floor, level);
      const room = Number.isFinite(floor) ? floor : 0;
      const roomBar = Math.min(LOUD_RMS, room * SPEECH_OVER_FLOOR);
      // A frame is speech if it clears the room bar and stands out of the room itself.
      let loud = level >= Math.max(SPEECH_RMS, roomBar) && level >= roomBefore * STANDS_OUT_OF_ROOM;
      // Once they have spoken, it also has to be past the pause point between the room and their voice: a steady fan
      // can sit above the room bar for ever, but it stays at the bottom of that range.
      if (loud && speechMs >= MIN_SPEECH_MS) loud = level >= room + PAUSE_POINT * (speakingLevel - room);
      if (loud) {
        speechMs += frameMs;
        lastLoud = now;
        if (level > speakingLevel) {
          speakingLevel += (level - speakingLevel) * (1 - Math.pow(0.5, frameMs / SPEECH_LEVEL_ATTACK_HALF_LIFE_MS));
        }
      }
      const spoke = speechMs >= MIN_SPEECH_MS;
      if (!spoke) return now - startedAt >= NO_SPEECH_MS ? "nothing" : loud ? "speaking" : "waiting";
      if (loud) return "speaking";
      return lastLoud !== null && now - lastLoud >= END_PAUSE_MS ? "done" : "pause";
    },
    heard: () => speechMs >= MIN_SPEECH_MS,
  };
}

/** Why voice in stopped, in a line the drawer shows. */
export type VoiceProblem = "blocked" | "no_mic" | "silent" | "empty" | "too_long" | "too_many" | "failed";

export const VOICE_PROBLEMS: Record<VoiceProblem, string> = {
  blocked: "I can't hear you: the microphone is blocked. Allow it in your browser's site settings, or type instead.",
  no_mic: "I can't find a microphone on this device. Type instead.",
  silent:
    "I couldn't hear anything from your microphone. Check your browser is using the right one, or type instead.",
  empty: "I heard you but couldn't make out the words. Try again a little closer to the mic, or type instead.",
  too_long: "That clip was too long for me. Try a shorter question, or type instead.",
  too_many: "That's a lot of voice clips in a minute. Try again shortly, or type instead.",
  failed: "That clip didn't come through. Try again, or type instead.",
};

/** The drawer's line for a getUserMedia failure: refused permission reads differently from no microphone. */
export function micProblem(error: unknown): VoiceProblem {
  const name = error instanceof Error || (typeof DOMException !== "undefined" && error instanceof DOMException) ? (error as Error).name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "blocked";
  if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "no_mic";
  return "failed";
}

/** The drawer's line for a failed /api/transcribe call, by HTTP status. */
export function transcribeProblem(status: number): VoiceProblem {
  if (status === 429) return "too_many";
  if (status === 422) return "empty";
  if (status === 413) return "too_long";
  return "failed";
}

/** Adds spoken words to what's already typed, with one space between. */
export function appendTranscript(typed: string, spoken: string): string {
  const words = spoken.replace(/\s+/g, " ").trim();
  if (!words) return typed;
  const before = typed.replace(/\s+$/, "");
  return (before ? `${before} ${words}` : words).slice(0, MAX_TRANSCRIPT_CHARS);
}
