import {
  AUDIO_TYPES,
  CLIP_BITS_PER_SECOND,
  END_PAUSE_MS,
  LOUD_RMS,
  MAX_CLIP_BYTES,
  MAX_CLIP_SECONDS,
  MAX_TRANSCRIPT_CHARS,
  MIN_SPEECH_MS,
  NO_SPEECH_MS,
  PAUSE_POINT,
  RECORDING_TYPES,
  STANDS_OUT_OF_ROOM,
  VOICE_PROBLEMS,
  appendTranscript,
  audioExtension,
  baseType,
  clipClock,
  createHearing,
  micProblem,
  pickRecordingType,
  rms,
  transcribeProblem,
} from "./voice-input";

describe("limits", () => {
  it("are the numbers the route and the drawer both hold to", () => {
    expect(MAX_CLIP_SECONDS).toBe(60);
    expect(MAX_TRANSCRIPT_CHARS).toBe(4_000);
  });

  it("record at 32 kbit/s, so a full minute is about 240 kB", () => {
    expect(CLIP_BITS_PER_SECOND).toBe(32_000);
    expect(MAX_CLIP_SECONDS * CLIP_BITS_PER_SECOND).toBe(1_920_000);
    expect(MAX_CLIP_SECONDS * CLIP_BITS_PER_SECOND / 8).toBeLessThan(MAX_CLIP_BYTES);
  });

  it("caps a clip at 1.1 MB: about four minutes of headroom over the recording rate, under the request limit", () => {
    expect(MAX_CLIP_BYTES).toBe(1_100_000);
    expect(MAX_CLIP_BYTES).toBeGreaterThan((MAX_CLIP_SECONDS * CLIP_BITS_PER_SECOND) / 8 * 4);
    expect(MAX_CLIP_BYTES).toBeLessThan(4_500_000);
  });
});

describe("baseType", () => {
  it("drops the codecs, spaces and case", () => {
    expect(baseType("audio/webm;codecs=opus")).toBe("audio/webm");
    expect(baseType("  Audio/MP4 ")).toBe("audio/mp4");
    expect(baseType("")).toBe("");
  });
});

describe("audioExtension", () => {
  it("gives the extension OpenAI reads the format from, for each type the route takes", () => {
    expect(audioExtension("audio/webm")).toBe("webm");
    expect(audioExtension("audio/ogg")).toBe("ogg");
    expect(audioExtension("audio/mp4")).toBe("mp4");
    expect(audioExtension("audio/x-m4a")).toBe("m4a");
    expect(audioExtension("audio/m4a")).toBe("m4a");
    expect(audioExtension("audio/aac")).toBe("m4a");
    expect(audioExtension("audio/mpeg")).toBe("mp3");
    expect(audioExtension("audio/wav")).toBe("wav");
    expect(audioExtension("audio/x-wav")).toBe("wav");
  });

  it("ignores the codecs parameter", () => {
    expect(audioExtension("audio/webm;codecs=opus")).toBe("webm");
    expect(audioExtension("audio/ogg; codecs=vorbis")).toBe("ogg");
  });

  it("takes the video container types some browsers label an audio-only recording with", () => {
    expect(audioExtension("video/webm")).toBe("webm");
    expect(audioExtension("video/mp4")).toBe("mp4");
  });

  it("is null for a type the route does not take", () => {
    expect(audioExtension("text/plain")).toBeNull();
    expect(audioExtension("image/png")).toBeNull();
    expect(audioExtension("")).toBeNull();
  });

  it("covers every entry of AUDIO_TYPES", () => {
    for (const type of Object.keys(AUDIO_TYPES)) {
      expect(audioExtension(type)).toBe(AUDIO_TYPES[type]);
    }
  });
});

describe("pickRecordingType", () => {
  it("picks the first recording format the browser supports, best first", () => {
    expect(pickRecordingType(() => true)).toBe(RECORDING_TYPES[0]);
    expect(pickRecordingType((t) => t === "audio/mp4")).toBe("audio/mp4");
    expect(pickRecordingType((t) => t === "audio/webm" || t === "audio/ogg;codecs=opus")).toBe("audio/webm");
  });

  it("gives an empty string when none is supported, so the browser chooses", () => {
    expect(pickRecordingType(() => false)).toBe("");
  });

  it("asks about each format in the order listed", () => {
    const asked: string[] = [];
    pickRecordingType((t) => {
      asked.push(t);
      return false;
    });
    expect(asked).toEqual(RECORDING_TYPES);
  });

  it("prefers Opus in WebM, then WebM, then Ogg Opus, then MP4 (Safari)", () => {
    expect(RECORDING_TYPES).toEqual(["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"]);
  });
});

describe("clipClock", () => {
  it("shows seconds recorded out of the limit", () => {
    expect(clipClock(0)).toBe("0:00 / 1:00");
    expect(clipClock(7)).toBe("0:07 / 1:00");
    expect(clipClock(59)).toBe("0:59 / 1:00");
  });

  it("writes minutes past a minute", () => {
    expect(clipClock(60)).toBe("1:00 / 1:00");
  });

  it("caps the count at the limit", () => {
    expect(clipClock(75)).toBe("1:00 / 1:00");
    expect(clipClock(999)).toBe("1:00 / 1:00");
  });

  it("drops fractions of a second", () => {
    expect(clipClock(6.9)).toBe("0:06 / 1:00");
  });
});

describe("micProblem", () => {
  const named = (name: string) => Object.assign(new Error("denied"), { name });

  it("is blocked when the visitor refused the microphone or the page may not use it", () => {
    expect(micProblem(named("NotAllowedError"))).toBe("blocked");
    expect(micProblem(named("SecurityError"))).toBe("blocked");
    expect(micProblem(named("PermissionDeniedError"))).toBe("blocked");
  });

  it("is no_mic when the device has no microphone or none fits the request", () => {
    expect(micProblem(named("NotFoundError"))).toBe("no_mic");
    expect(micProblem(named("DevicesNotFoundError"))).toBe("no_mic");
    expect(micProblem(named("OverconstrainedError"))).toBe("no_mic");
  });

  it("is failed for any other error", () => {
    expect(micProblem(named("NotReadableError"))).toBe("failed");
    expect(micProblem(new Error("something else"))).toBe("failed");
  });

  it("reads a DOMException the same way as an Error", () => {
    expect(micProblem(new DOMException("no", "NotAllowedError"))).toBe("blocked");
    expect(micProblem(new DOMException("no", "NotFoundError"))).toBe("no_mic");
  });

  it("is failed for a value that is not an error at all", () => {
    expect(micProblem("NotAllowedError")).toBe("failed");
    expect(micProblem(null)).toBe("failed");
    expect(micProblem(undefined)).toBe("failed");
  });
});

describe("transcribeProblem", () => {
  it("is too_long for a 413: the clip is over what the route takes", () => {
    expect(transcribeProblem(413)).toBe("too_long");
  });

  it("is too_many for a 429", () => {
    expect(transcribeProblem(429)).toBe("too_many");
  });

  it("is empty for a 422", () => {
    expect(transcribeProblem(422)).toBe("empty");
  });

  it("is failed for anything else", () => {
    expect(transcribeProblem(502)).toBe("failed");
    expect(transcribeProblem(500)).toBe("failed");
    expect(transcribeProblem(503)).toBe("failed");
  });
});

describe("VOICE_PROBLEMS", () => {
  it("has a line for every problem, each in plain words that offer typing", () => {
    for (const key of ["blocked", "no_mic", "empty", "too_many", "failed"] as const) {
      expect(VOICE_PROBLEMS[key].length).toBeGreaterThan(0);
      expect(VOICE_PROBLEMS[key]).toMatch(/type/i);
    }
  });
});

describe("appendTranscript", () => {
  it("puts the spoken words in an empty box as they are", () => {
    expect(appendTranscript("", "What did you build at Illumina?")).toBe("What did you build at Illumina?");
  });

  it("adds the words after what is typed, with one space between", () => {
    expect(appendTranscript("Tell me about", "the Illumina work")).toBe("Tell me about the Illumina work");
  });

  it("drops trailing spaces of what is typed before joining", () => {
    expect(appendTranscript("Tell me about   \n", "Illumina")).toBe("Tell me about Illumina");
  });

  it("collapses runs of whitespace in the spoken words and trims them", () => {
    expect(appendTranscript("", "  what\n\ndid   you\tbuild  ")).toBe("what did you build");
  });

  it("returns what was typed unchanged when nothing was spoken", () => {
    expect(appendTranscript("Typed already", "")).toBe("Typed already");
    expect(appendTranscript("Typed already", "   \n ")).toBe("Typed already");
  });

  it("keeps what is typed, untouched, when nothing was spoken, even with trailing spaces", () => {
    expect(appendTranscript("Typed   ", "")).toBe("Typed   ");
  });

  it("caps the box at the chat's per-message limit", () => {
    const out = appendTranscript("a".repeat(3_990), "bbbbbbbbbbbbbbbbbbbb");
    expect(out).toHaveLength(MAX_TRANSCRIPT_CHARS);
    expect(out.startsWith("a".repeat(3_990) + " b")).toBe(true);
  });

  it("caps spoken words that are longer than the limit on their own", () => {
    expect(appendTranscript("", "x".repeat(5_000))).toHaveLength(MAX_TRANSCRIPT_CHARS);
  });
});

describe("rms", () => {
  it("is 0 for no samples", () => {
    expect(rms([])).toBe(0);
  });

  it("is the level of a steady signal, whatever its sign", () => {
    expect(rms([0.2, 0.2, 0.2])).toBeCloseTo(0.2);
    expect(rms([-0.2, -0.2])).toBeCloseTo(0.2);
  });

  it("is 1 for a full-scale square wave", () => {
    expect(rms([1, -1, 1, -1])).toBe(1);
  });

  it("is 0 for silence", () => {
    expect(rms(new Float32Array(1024))).toBe(0);
  });

  it("works on a typed array frame, as the analyser fills one", () => {
    expect(rms(new Float32Array([0.3, -0.3, 0.3, -0.3]))).toBeCloseTo(0.3);
  });
});

describe("createHearing", () => {
  /** Feeds a frame every 50 ms from `from` for `ms` milliseconds at `level`; returns the last answer and the end time. */
  function feed(h: ReturnType<typeof createHearing>, level: number, from: number, ms: number) {
    let answer: ReturnType<typeof h.hear> = "waiting";
    for (let t = from + 50; t <= from + ms; t += 50) answer = h.hear(level, t);
    return { answer, end: from + ms };
  }
  /** Half a second of quiet room (0.001) first, so the floor is set the way a real recording starts. */
  const room = (h: ReturnType<typeof createHearing>) => feed(h, 0.001, 0, 500);

  it("is waiting while the room is quiet before anyone speaks", () => {
    const h = createHearing(0);
    expect(room(h).answer).toBe("waiting");
    expect(h.heard()).toBe(false);
  });

  it("is speaking once a loud frame arrives, but counts as heard only after MIN_SPEECH_MS of loud sound", () => {
    const h = createHearing(0);
    const quiet = room(h);
    expect(h.hear(0.2, quiet.end + 50)).toBe("speaking");
    expect(h.heard()).toBe(false);
    feed(h, 0.2, quiet.end + 50, MIN_SPEECH_MS);
    expect(h.heard()).toBe(true);
  });

  it("counts the time between frames, so one long frame can make up the speech", () => {
    const h = createHearing(0);
    const quiet = room(h);
    expect(h.hear(0.2, quiet.end + MIN_SPEECH_MS + 100)).toBe("speaking");
    expect(h.heard()).toBe(true);
  });

  it("ignores a cough shorter than MIN_SPEECH_MS: never heard, and nothing once the no-speech limit passes", () => {
    const h = createHearing(0);
    const quiet = room(h);
    const cough = feed(h, 0.3, quiet.end, 100);
    expect(h.heard()).toBe(false);
    expect(feed(h, 0.001, cough.end, END_PAUSE_MS * 2).answer).not.toBe("done");
    expect(h.hear(0.001, NO_SPEECH_MS)).toBe("nothing");
    expect(h.heard()).toBe(false);
  });

  it("is pausing while it is quiet after speech, and done once END_PAUSE_MS has passed since the last loud frame", () => {
    const h = createHearing(0);
    const quiet = room(h);
    const spoken = feed(h, 0.2, quiet.end, 400);
    expect(h.heard()).toBe(true);

    expect(h.hear(0.001, spoken.end + 50)).toBe("pause");
    expect(h.hear(0.001, spoken.end + END_PAUSE_MS - 50)).toBe("pause");
    expect(h.hear(0.001, spoken.end + END_PAUSE_MS)).toBe("done");
  });

  it("goes back to speaking when the voice returns before the pause ends", () => {
    const h = createHearing(0);
    const quiet = room(h);
    const spoken = feed(h, 0.2, quiet.end, 400);
    feed(h, 0.001, spoken.end, 600);
    expect(h.hear(0.2, spoken.end + 650)).toBe("speaking");
    expect(h.hear(0.001, spoken.end + 700)).toBe("pause");
  });

  it("a single loud first frame, with no duration yet, does not satisfy the 200 ms minimum", () => {
    const h = createHearing(0);
    expect(h.hear(0.2, 0)).toBe("speaking");
    expect(h.heard()).toBe(false);
    expect(h.hear(0, 1_400)).toBe("waiting");
    expect(h.heard()).toBe(false);
  });

  it("says nothing once NO_SPEECH_MS has passed with no speech", () => {
    const h = createHearing(0);
    expect(h.hear(0.001, NO_SPEECH_MS - 50)).toBe("waiting");
    expect(h.hear(0.001, NO_SPEECH_MS)).toBe("nothing");
  });

  it("counts a loud frame that arrives just before the no-speech limit as speech, not nothing", () => {
    const h = createHearing(0);
    room(h);
    expect(h.hear(0.2, NO_SPEECH_MS - 10)).toBe("speaking");
    expect(h.heard()).toBe(true);
  });

  it("in a noisy room, takes the room's floor and needs a clear rise above it", () => {
    const h = createHearing(0);
    // Steady room noise at 0.01: the floor is 0.01, so speech must reach 0.03 (3x the floor, under the 0.04 cap).
    feed(h, 0.01, 0, 1000);
    expect(h.hear(0.02, 1050)).toBe("waiting");
    expect(h.heard()).toBe(false);
    expect(h.hear(0.04, 1100)).toBe("speaking");
  });

  it("talking from the very first frame, with no quiet lead-in, is heard and ends in done after a pause", () => {
    const h = createHearing(0);
    // Levels of 0.08 to 0.15 from the start: the first frame sets the floor at 0.08, but the room bar never passes 0.04.
    let last: ReturnType<typeof h.hear> = "waiting";
    for (let t = 50; t <= 350; t += 50) last = h.hear(t % 100 === 0 ? 0.08 : 0.15, t);
    expect(last).toBe("speaking");
    expect(h.heard()).toBe(true);

    expect(h.hear(0.001, 350 + END_PAUSE_MS - 50)).toBe("pause");
    expect(h.hear(0.001, 350 + END_PAUSE_MS)).toBe("done");
  });

  it("in a very loud room, still needs only LOUD_RMS (0.04) to count as speech", () => {
    expect(LOUD_RMS).toBe(0.04);
    const h = createHearing(0);
    // Room noise at 0.03: 3x the floor would be 0.09, but the bar is capped at 0.04.
    feed(h, 0.03, 0, 1000);
    expect(h.hear(0.039, 1050)).toBe("waiting");
    expect(h.heard()).toBe(false);
    expect(h.hear(0.04, 1100)).toBe("speaking");
    feed(h, 0.04, 1100, MIN_SPEECH_MS);
    expect(h.heard()).toBe(true);
  });

  it("uses the quietest room noise it has heard, not the loudest", () => {
    const h = createHearing(0);
    feed(h, 0.05, 0, 200);
    feed(h, 0.002, 200, 200);
    // The floor is now 0.002, so the threshold is the 0.01 minimum: 0.02 is speech.
    expect(h.hear(0.02, 450)).toBe("speaking");
  });

  it("ignores exact-zero frames (a muted or just-opened track) when taking the floor", () => {
    const h = createHearing(0);
    feed(h, 0, 0, 1000);
    // A real floor of 0.005 sets the threshold at 0.015. Had the zeros counted, the floor would be 0 and 0.012 would be speech.
    h.hear(0.005, 1050);
    expect(h.hear(0.012, 1100)).toBe("waiting");
    expect(h.heard()).toBe(false);
  });

  it("an exactly-zero frame is never speech", () => {
    const h = createHearing(0);
    feed(h, 0, 0, 1000);
    expect(h.heard()).toBe(false);
  });
});

describe("createHearing: hearing the end of a question over steady noise", () => {
  /** Feeds a frame every 50 ms from `from` for `ms` milliseconds at `level`, returning every answer. */
  function feedAll(h: ReturnType<typeof createHearing>, level: number, from: number, ms: number) {
    const answers: { t: number; answer: ReturnType<typeof h.hear> }[] = [];
    for (let t = from + 50; t <= from + ms; t += 50) answers.push({ t, answer: h.hear(level, t) });
    return { answers, end: from + ms };
  }
  const firstDone = (answers: { t: number; answer: string }[]) => answers.find((a) => a.answer === "done")?.t;

  it("holds the numbers the pause is measured against", () => {
    expect(PAUSE_POINT).toBe(0.35);
    expect(STANDS_OUT_OF_ROOM).toBe(1.25);
  });

  it("with a loud fan (0.06), ends END_PAUSE_MS after the speech does, not never", () => {
    const h = createHearing(0);
    const fan = feedAll(h, 0.06, 0, 1_000);
    const speech = feedAll(h, 0.2, fan.end, 1_500);
    expect(firstDone(speech.answers)).toBeUndefined();
    const after = feedAll(h, 0.06, speech.end, 3_000);
    const done = firstDone(after.answers);
    expect(done).toBeDefined();
    expect(done!).toBeGreaterThanOrEqual(speech.end + END_PAUSE_MS - 50);
    expect(done!).toBeLessThanOrEqual(speech.end + END_PAUSE_MS + 100);
  });

  it("a quiet speaker in a quiet room (speech 0.02, room 0.003) is done after the pause", () => {
    const h = createHearing(0);
    const room = feedAll(h, 0.003, 0, 500);
    const speech = feedAll(h, 0.02, room.end, 1_000);
    expect(h.heard()).toBe(true);
    const after = feedAll(h, 0.003, speech.end, 3_000);
    const done = firstDone(after.answers);
    expect(done).toBeGreaterThanOrEqual(speech.end + END_PAUSE_MS - 50);
    expect(done).toBeLessThanOrEqual(speech.end + END_PAUSE_MS + 100);
  });

  it("natural speech that dips (0.2 then 0.08 every 150 ms for 2 s) is never done mid-speech", () => {
    const h = createHearing(0);
    const room = feedAll(h, 0.001, 0, 500);
    const answers: string[] = [];
    for (let t = room.end + 50; t <= room.end + 2_000; t += 50) {
      const inCycle = (t - room.end - 50) % 300;
      answers.push(h.hear(inCycle < 150 ? 0.2 : 0.08, t));
    }
    expect(answers).not.toContain("done");
    expect(h.heard()).toBe(true);
  });

  it("one loud shout (0.6 for 100 ms) inside normal speech (0.15) does not end the recording early", () => {
    const h = createHearing(0);
    const room = feedAll(h, 0.001, 0, 500);
    const before = feedAll(h, 0.15, room.end, 1_000);
    const shout = feedAll(h, 0.6, before.end, 100);
    const after = feedAll(h, 0.15, shout.end, 2_000);
    expect(after.answers.map((a) => a.answer)).not.toContain("done");
  });
});

describe("createHearing: a pause is closer to the room than to your voice", () => {
  /** A fan at the mic: steady, with a little jitter, never under 0.055 and never over 0.064. */
  const FAN = [0.06, 0.064, 0.057, 0.062, 0.055, 0.063];
  const fanAt = (t: number) => FAN[(t / 50) % FAN.length];

  /** Runs a frame every 50 ms from 50 to `until`, the level at each time given by `levelAt`. */
  function run(h: ReturnType<typeof createHearing>, until: number, levelAt: (t: number) => number) {
    const answers: { t: number; answer: ReturnType<typeof h.hear> }[] = [];
    for (let t = 50; t <= until; t += 50) answers.push({ t, answer: h.hear(levelAt(t), t) });
    return answers;
  }
  const firstAt = (answers: { t: number; answer: string }[], what: string) => answers.find((a) => a.answer === what)?.t;
  const lastAt = (answers: { t: number; answer: string }[], what: string) =>
    [...answers].reverse().find((a) => a.answer === what)?.t;

  it("holds the numbers the pause is measured against", () => {
    expect(STANDS_OUT_OF_ROOM).toBeGreaterThan(1);
    expect(PAUSE_POINT).toBe(0.35);
  });

  it("a loud fan alone for 8 s is never speech: nothing, right at NO_SPEECH_MS", () => {
    const h = createHearing(0);
    const answers = run(h, 8_000, fanAt);
    expect(h.heard()).toBe(false);
    expect(answers.filter((a) => a.answer === "speaking").length * 50).toBeLessThan(MIN_SPEECH_MS);
    expect(answers.map((a) => a.answer)).not.toContain("done");
    const nothing = firstAt(answers, "nothing");
    expect(nothing).toBeDefined();
    expect(nothing!).toBeGreaterThanOrEqual(NO_SPEECH_MS);
    expect(nothing!).toBeLessThanOrEqual(NO_SPEECH_MS + 100);
  });

  it.each([0.1, 0.2])("a fan, then a 2 s question at %s over it, is done END_PAUSE_MS after the question ends", (voice) => {
    const h = createHearing(0);
    const speechEnd = 3_000;
    const answers = run(h, speechEnd + 4_000, (t) => (t > 1_000 && t <= speechEnd ? voice : fanAt(t)));
    expect(h.heard()).toBe(true);
    const done = firstAt(answers, "done");
    expect(done).toBeDefined();
    expect(done!).toBeGreaterThanOrEqual(speechEnd + END_PAUSE_MS - 50);
    expect(done!).toBeLessThanOrEqual(speechEnd + END_PAUSE_MS + 150);
    // Never done while they were still talking.
    expect(answers.filter((a) => a.t <= speechEnd).map((a) => a.answer)).not.toContain("done");
  });

  it("talking the instant the mic opens, with a 100 ms dip every 600 ms, still counts and ends after the pause", () => {
    const h = createHearing(0);
    const talkingUntil = 3_000;
    const answers = run(h, talkingUntil + 3_000, (t) =>
      t > talkingUntil ? 0.002 : (t - 50) % 600 >= 500 ? 0.002 : 0.15,
    );
    expect(h.heard()).toBe(true);
    const lastSpoke = lastAt(answers, "speaking")!;
    expect(lastSpoke).toBeGreaterThan(talkingUntil - 700);
    expect(answers.filter((a) => a.t <= lastSpoke).map((a) => a.answer)).not.toContain("done");
    const done = firstAt(answers, "done");
    expect(done).toBeDefined();
    expect(done!).toBeGreaterThanOrEqual(lastSpoke + END_PAUSE_MS - 50);
    expect(done!).toBeLessThanOrEqual(lastSpoke + END_PAUSE_MS + 150);
  });

  it("once they have spoken, a frame between the room and the pause point to their voice is a pause, not speech", () => {
    const h = createHearing(0);
    run(h, 500, () => 0.01);
    // Room 0.01, voice 0.2 for a second: the pause point is about 0.0765.
    for (let t = 550; t <= 1_550; t += 50) h.hear(0.2, t);
    expect(h.hear(0.05, 1_600)).toBe("pause");
    expect(h.hear(0.07, 1_650)).toBe("pause");
    expect(h.hear(0.09, 1_700)).toBe("speaking");
  });

  it("a 600 ms laugh at 0.45 inside 0.15 speech does not make normal speech look like a pause", () => {
    const h = createHearing(0);
    const laughStart = 1_500;
    const laughEnd = 2_100;
    const speechEnd = 5_100;
    const answers = run(h, speechEnd + 3_000, (t) => {
      if (t <= 500 || t > speechEnd) return 0.001;
      return t > laughStart && t <= laughEnd ? 0.45 : 0.15;
    });
    expect(h.heard()).toBe(true);
    // Every frame of speech after the laugh is still speech: no pause, so never done, until they stop.
    expect(answers.filter((a) => a.t > laughEnd && a.t <= speechEnd).map((a) => a.answer)).toEqual(
      Array(Math.round((speechEnd - laughEnd) / 50)).fill("speaking"),
    );
    const done = firstAt(answers, "done");
    expect(done).toBeDefined();
    expect(done!).toBeGreaterThanOrEqual(speechEnd + END_PAUSE_MS - 50);
    expect(done!).toBeLessThanOrEqual(speechEnd + END_PAUSE_MS + 150);
  });

  it("the pause point does not sink during a pause: a frame under it stays a pause seconds later", () => {
    const h = createHearing(0);
    for (let t = 50; t <= 500; t += 50) h.hear(0.01, t);
    for (let t = 550; t <= 1_550; t += 50) h.hear(0.2, t);
    // The voice halved every 3 s would put the pause point near 0.05 after 5 s; it stays near 0.0765.
    expect(h.hear(0.07, 6_600)).toBe("done");
    expect(h.hear(0.07, 6_650)).toBe("done");
  });

  it("before anyone has spoken, the pause-point rule is not in play: a frame over the room bar is speech", () => {
    const h = createHearing(0);
    for (let t = 50; t <= 500; t += 50) h.hear(0.01, t);
    expect(h.hear(0.05, 550)).toBe("speaking");
  });
});
