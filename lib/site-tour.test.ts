import { PAGE_TARGET_IDS } from "./profile";
import { STARTER_PROMPTS } from "./starter-prompts";
import recordedTour from "@/content/site-tour.json";
import {
  DRAWER_TARGET_IDS,
  SITE_TOUR,
  TOUR_ON_SITE,
  TOUR_BUDGET_MS,
  TOUR_TARGET_IDS,
  TYPE_WORDS_PER_SECOND,
  parseTour,
  spokenStep,
  stepDurationAt,
  stepDurationMs,
  tourDurationMs,
  tourJsonSchema,
  tourProblems,
  type SiteTour,
  type TourStep,
} from "./site-tour";

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");
const step = (say: string, targets: string[] = [], ask?: string[]): TourStep =>
  ask === undefined ? { say, targets } : { say, targets, ask };
const tour = (steps: TourStep[], extra: Partial<SiteTour> = {}): SiteTour => ({
  draft: false,
  recordedAt: null,
  model: null,
  steps,
  ...extra,
});
const validSteps = (): TourStep[] => [step("Hello there."), step("Look at this.", ["role-uob"]), step("Goodbye.")];

describe("target ids", () => {
  it("lists the drawer's two features: the Ask Titus button and the job-description mode", () => {
    expect([...DRAWER_TARGET_IDS]).toEqual(["ask-button", "fit-mode"]);
  });

  it("is every page target plus the drawer targets", () => {
    expect(TOUR_TARGET_IDS).toEqual([...PAGE_TARGET_IDS, ...DRAWER_TARGET_IDS]);
  });

  it("includes the two places the tour added to show_on_page", () => {
    expect(TOUR_TARGET_IDS).toEqual(expect.arrayContaining(["all-roles", "colophon-page"]));
  });
});

describe("stepDurationMs", () => {
  it("is words / 3 seconds, plus 2000 ms per target: 30 words and a target is 12000", () => {
    expect(stepDurationMs(step(words(30), ["role-uob"]))).toBe(12000);
  });

  it("adds no move time to a step that shows nothing: 30 words is 10000", () => {
    expect(stepDurationMs(step(words(30)))).toBe(10000);
  });

  it("counts a move for every target the step shows: 15 words and 1, 2, 3 targets is 7000, 9000, 11000", () => {
    expect(stepDurationMs(step(words(15), ["role-uob"]))).toBe(7000);
    expect(stepDurationMs(step(words(15), ["role-uob", "role-illumina"]))).toBe(9000);
    expect(stepDurationMs(step(words(15), ["role-uob", "role-illumina", "all-roles"]))).toBe(11000);
  });

  it("adds 1000 ms per example question: 15 words and 2 questions is 7000", () => {
    expect(stepDurationMs(step(words(15), [], ["a", "b"]))).toBe(7000);
  });

  it("adds targets and questions together: 15 words, 1 target and 2 questions is 9000", () => {
    expect(stepDurationMs(step(words(15), ["writing"], ["a", "b"]))).toBe(9000);
  });

  it("treats an empty or missing ask as no extra time", () => {
    expect(stepDurationMs(step(words(15), [], []))).toBe(5000);
    expect(stepDurationMs(step(words(15)))).toBe(5000);
  });

  it("clamps at the 4000 ms floor and the 16000 ms ceiling with questions too", () => {
    expect(stepDurationMs(step(words(3), [], []))).toBe(4000);
    expect(stepDurationMs(step(words(3), [], ["a", "b"]))).toBe(4000);
    expect(stepDurationMs(step(words(60), ["writing", "role-uob"], ["a", "b"]))).toBe(16000);
  });

  it("clamps many targets to the ceiling: 30 words and 3 targets would be 16000 exactly, 4 is still 16000", () => {
    expect(stepDurationMs(step(words(30), ["role-uob", "role-illumina", "all-roles"]))).toBe(16000);
    expect(stepDurationMs(step(words(30), ["role-uob", "role-illumina", "all-roles", "writing"]))).toBe(16000);
  });

  it("never goes under the 4000 ms floor: 3 words and no targets is 4000", () => {
    expect(stepDurationMs(step(words(3)))).toBe(4000);
  });

  it("floors an empty line at 4000", () => {
    expect(stepDurationMs(step(""))).toBe(4000);
    expect(stepDurationMs(step("   "))).toBe(4000);
  });

  it("never goes over the 16000 ms ceiling: 200 words is 16000", () => {
    expect(stepDurationMs(step(words(200)))).toBe(16000);
    expect(stepDurationMs(step(words(200), ["writing"]))).toBe(16000);
  });

  it("sits exactly on the boundaries: 12 words is 4000, 13 words is 4333 (rounded)", () => {
    expect(stepDurationMs(step(words(12)))).toBe(4000);
    expect(stepDurationMs(step(words(13)))).toBe(4333);
  });

  it("counts words split on any whitespace, including newlines and runs of spaces", () => {
    expect(stepDurationMs(step(`${words(15)}\n\n  ${words(15)}`))).toBe(stepDurationMs(step(words(30))));
  });

  it("returns a whole number of milliseconds", () => {
    expect(Number.isInteger(stepDurationMs(step(words(14))))).toBe(true);
  });
});

describe("stepDurationAt", () => {
  it("equals stepDurationMs for every step but the last", () => {
    const t = tour([step(words(30), ["role-uob"]), step(words(3)), step(words(30), ["writing"], ["a"]), step(words(30))]);
    for (const i of [0, 1, 2]) expect(stepDurationAt(t, i)).toBe(stepDurationMs(t.steps[i]));
  });

  it("equals stepDurationMs for a middle step that shows nothing", () => {
    const t = tour([step(words(30)), step(words(30)), step(words(30))]);
    expect(stepDurationAt(t, 0)).toBe(10000);
    expect(stepDurationAt(t, 1)).toBe(10000);
  });

  it("is words at 12 a second plus 1200 ms for a last step with no targets", () => {
    expect(stepDurationAt(tour([step("a"), step("b"), step(words(24))]), 2)).toBe(3200);
    expect(stepDurationAt(tour([step("a"), step("b"), step(words(60))]), 2)).toBe(6200);
  });

  it("rounds the last step to a whole millisecond", () => {
    // 17 words: 17/12 s = 1416.67 ms, plus 1200.
    const d = stepDurationAt(tour([step("a"), step("b"), step(words(17))]), 2);
    expect(d).toBe(2617);
    expect(Number.isInteger(d)).toBe(true);
  });

  it("ignores the 4 s floor and the 16 s ceiling on a closing step with no targets", () => {
    expect(stepDurationAt(tour([step("a"), step("b"), step(words(3))]), 2)).toBe(2500);
    expect(stepDurationAt(tour([step("a"), step("b"), step(words(300))]), 2)).toBe(26200);
  });

  it("floors a short closing line at 2500 ms", () => {
    expect(stepDurationAt(tour([step("a"), step("b"), step("One.")]), 2)).toBe(2500);
    expect(stepDurationAt(tour([step("a"), step("b"), step(words(13))]), 2)).toBe(2500);
    // 15 words: 1250 + 1200 = 2450, still under; 16 words: 1333 + 1200 = 2533, over.
    expect(stepDurationAt(tour([step("a"), step("b"), step(words(15))]), 2)).toBe(2500);
    expect(stepDurationAt(tour([step("a"), step("b"), step(words(16))]), 2)).toBe(2533);
  });

  it("uses stepDurationMs for a last step with example questions, even with no targets", () => {
    const t = tour([step("a"), step("b"), step(words(24), [], ["x", "y"])]);
    expect(stepDurationAt(t, 2)).toBe(stepDurationMs(t.steps[2]));
    expect(stepDurationAt(t, 2)).toBe(10000);
  });

  it("treats an empty ask list as no ask: the short closing timing applies", () => {
    expect(stepDurationAt(tour([step("a"), step("b"), step(words(24), [], [])]), 2)).toBe(3200);
  });

  it("uses stepDurationMs for a last step that has targets", () => {
    const t = tour([step("a"), step("b"), step(words(30), ["role-uob"])]);
    expect(stepDurationAt(t, 2)).toBe(stepDurationMs(t.steps[2]));
    expect(stepDurationAt(t, 2)).toBe(12000);
  });

  it("is a closing step only when last: the same line mid-tour keeps its reading time", () => {
    const closing = step(words(24));
    expect(stepDurationAt(tour([closing, step("b"), step("c")]), 0)).toBe(stepDurationMs(closing));
    expect(stepDurationAt(tour([step("a"), step("b"), closing]), 2)).toBe(3200);
  });

  it("treats a one-step tour's only step as the last", () => {
    expect(stepDurationAt(tour([step(words(24))]), 0)).toBe(3200);
    expect(stepDurationAt(tour([step(words(24), ["role-uob"])]), 0)).toBe(10000);
  });

  it("counts whitespace-only words as none: an empty closing line is the 2500 ms floor", () => {
    expect(stepDurationAt(tour([step("a"), step("b"), step("  ")]), 2)).toBe(2500);
  });

  it("times the shipped tour's closing step by typing, not by reading", () => {
    const i = SITE_TOUR.steps.length - 1;
    const closing = SITE_TOUR.steps[i];
    expect(closing.targets).toEqual([]);
    const d = stepDurationAt(SITE_TOUR, i);
    // The typing formula for its own word count: typing time plus the 1200 ms final hold (3200 ms for 24 words, above).
    const wordCount = closing.say.trim().split(/\s+/).filter(Boolean).length;
    expect(d).toBe(Math.round((wordCount / TYPE_WORDS_PER_SECOND) * 1000 + 1200));
    expect(d).toBeGreaterThan(2500);
    expect(d).toBeLessThan(8000);
    expect(d).toBeLessThan(stepDurationMs(closing));
  });
});

describe("TYPE_WORDS_PER_SECOND", () => {
  it("is 12, the speed the drawer types at", () => {
    expect(TYPE_WORDS_PER_SECOND).toBe(12);
  });
});

describe("spokenStep", () => {
  it("is the line alone when there is no ask", () => {
    expect(spokenStep(step("Hello there."))).toBe("Hello there.");
    expect(spokenStep(step("Hello there.", ["writing"]))).toBe("Hello there.");
  });

  it("is the line alone for an empty ask list", () => {
    expect(spokenStep(step("Hello there.", [], []))).toBe("Hello there.");
  });

  it("adds the examples after the line: \"Examples: \" then the questions joined by a space", () => {
    expect(spokenStep(step("Try these.", ["writing"], ["One?", "Two?"]))).toBe("Try these. Examples: One? Two?");
    expect(spokenStep(step("Try this.", [], ["Only?"]))).toBe("Try this. Examples: Only?");
  });

  it("reads the shipped writing step with both of its questions", () => {
    const writing = SITE_TOUR.steps.find((s) => s.ask?.length) as TourStep;
    const spoken = spokenStep(writing);
    expect(spoken.startsWith(`${writing.say} Examples: `)).toBe(true);
    for (const q of writing.ask ?? []) expect(spoken).toContain(q);
  });
});

describe("tourDurationMs", () => {
  it("sums its steps, the closing step by stepDurationAt", () => {
    const t = tour([step(words(30), ["role-uob"]), step(words(3)), step(words(30))]);
    // 12000 + 4000 + (30 words / 12 per s + 1.2 s = 3700)
    expect(tourDurationMs(t)).toBe(12000 + 4000 + 3700);
  });

  it("sums stepDurationAt over every step", () => {
    const t = tour([step(words(30), ["role-uob"]), step(words(3)), step(words(40), ["writing"], ["a"]), step(words(20))]);
    const sum = t.steps.reduce((acc, _, i) => acc + stepDurationAt(t, i), 0);
    expect(tourDurationMs(t)).toBe(sum);
  });

  it("uses stepDurationMs for a last step with targets", () => {
    const t = tour([step(words(30)), step(words(30), ["role-uob"])]);
    expect(tourDurationMs(t)).toBe(10000 + 12000);
  });

  it("is the shipped tour's stepDurationAt sum, shorter than the old reading-time sum", () => {
    const old = SITE_TOUR.steps.reduce((acc, s) => acc + stepDurationMs(s), 0);
    const now = SITE_TOUR.steps.reduce((acc, _, i) => acc + stepDurationAt(SITE_TOUR, i), 0);
    expect(tourDurationMs(SITE_TOUR)).toBe(now);
    expect(now).toBeLessThan(old);
  });

  it("is 0 for a tour with no steps", () => {
    expect(tourDurationMs(tour([]))).toBe(0);
  });
});

describe("parseTour", () => {
  it.each([
    ["an empty object", {}],
    ["null", null],
    ["undefined", undefined],
    ["a string", "tour"],
    ["a number", 3],
    ["an array", []],
    ["steps that are not an array", { steps: "none" }],
    ["a step missing say", { steps: [{ targets: [] }] }],
    ["a step whose say is not a string", { steps: [{ say: 4, targets: [] }] }],
    ["a step missing targets", { steps: [{ say: "hi" }] }],
    ["targets that are not an array", { steps: [{ say: "hi", targets: "role-uob" }] }],
    ["targets holding a non-string", { steps: [{ say: "hi", targets: [1] }] }],
    ["an ask that is not an array", { steps: [{ say: "hi", targets: [], ask: "How?" }] }],
    ["an ask holding a non-string", { steps: [{ say: "hi", targets: [], ask: [1] }] }],
    ["a null ask", { steps: [{ say: "hi", targets: [], ask: null }] }],
    ["a null step", { steps: [null] }],
    ["one good step and one bad", { steps: [{ say: "hi", targets: [] }, { say: "x" }] }],
  ])("returns null for %s", (_name, raw) => {
    expect(parseTour(raw)).toBeNull();
  });

  it("returns the tour for a valid one, with every field carried over", () => {
    const raw = {
      draft: false,
      recordedAt: "2026-11-25T10:00:00.000Z",
      model: "gpt-6-luna",
      steps: [{ say: "Hi.", targets: ["role-uob"] }],
    };
    expect(parseTour(raw)).toEqual(raw);
  });

  it("accepts a tour with no steps (tourProblems is what rejects it)", () => {
    expect(parseTour({ steps: [] })).toEqual({ draft: true, recordedAt: null, model: null, steps: [] });
  });

  it("treats anything but an explicit draft:false as a draft, so a stray file stays off the live site", () => {
    expect(parseTour({ steps: [] })?.draft).toBe(true);
    expect(parseTour({ draft: "no", steps: [] })?.draft).toBe(true);
    expect(parseTour({ draft: null, steps: [] })?.draft).toBe(true);
    expect(parseTour({ draft: false, steps: [] })?.draft).toBe(false);
    expect(parseTour({ draft: true, steps: [] })?.draft).toBe(true);
  });

  it("reads recordedAt and model as null unless they are strings", () => {
    const parsed = parseTour({ recordedAt: 5, model: {}, steps: [] });
    expect(parsed?.recordedAt).toBeNull();
    expect(parsed?.model).toBeNull();
  });

  it("copies the steps, so editing the result does not touch the input", () => {
    const raw = { steps: [{ say: "Hi.", targets: ["role-uob"] }] };
    const parsed = parseTour(raw)!;
    parsed.steps[0].targets.push("writing");
    parsed.steps[0].say = "changed";
    expect(raw.steps[0]).toEqual({ say: "Hi.", targets: ["role-uob"] });
  });

  it("keeps a non-empty ask, copied", () => {
    const raw = { steps: [{ say: "Hi.", targets: [], ask: ["What did you build at Illumina?"] }] };
    const parsed = parseTour(raw)!;
    expect(parsed.steps[0]).toEqual({ say: "Hi.", targets: [], ask: ["What did you build at Illumina?"] });
    parsed.steps[0].ask!.push("more");
    expect(raw.steps[0].ask).toEqual(["What did you build at Illumina?"]);
  });

  it("omits ask when it is empty or absent", () => {
    const parsed = parseTour({ steps: [{ say: "a", targets: [], ask: [] }, { say: "b", targets: [] }] })!;
    expect(parsed.steps[0]).toEqual({ say: "a", targets: [] });
    expect("ask" in parsed.steps[0]).toBe(false);
    expect("ask" in parsed.steps[1]).toBe(false);
  });

  it("drops fields a step does not declare", () => {
    const parsed = parseTour({ steps: [{ say: "Hi.", targets: [], extra: true }] });
    expect(parsed?.steps[0]).toEqual({ say: "Hi.", targets: [] });
  });
});

describe("tourProblems", () => {
  it("returns [] for a valid tour", () => {
    expect(tourProblems(tour(validSteps()))).toEqual([]);
  });

  it("flags an unknown target by its step number", () => {
    const steps = validSteps();
    steps[1] = step("Look.", ["role-nowhere"]);
    expect(tourProblems(tour(steps))).toEqual(["step 2: unknown target role-nowhere"]);
  });

  it("flags every unknown target, one line each", () => {
    const steps = validSteps();
    steps[0] = step("Hi.", ["nope-a", "role-uob", "nope-b"]);
    expect(tourProblems(tour(steps))).toEqual(["step 1: unknown target nope-a", "step 1: unknown target nope-b"]);
  });

  it("accepts the drawer targets and the new page targets", () => {
    const steps = [step("a", ["ask-button", "fit-mode"]), step("b", ["all-roles"]), step("c", ["colophon-page"])];
    expect(tourProblems(tour(steps))).toEqual([]);
  });

  it("rejects the old colophon id, which the site footer owns", () => {
    const steps = validSteps();
    steps[2] = step("Bye.", ["colophon"]);
    expect(tourProblems(tour(steps))).toEqual(["step 3: unknown target colophon"]);
  });

  it("accepts example questions that are starter prompts", () => {
    const steps = validSteps();
    steps[1] = step("Try one.", ["writing"], [STARTER_PROMPTS[2], STARTER_PROMPTS[3]]);
    expect(tourProblems(tour(steps))).toEqual([]);
  });

  it("flags an example question that is not a starter prompt, by its step number", () => {
    const steps = validSteps();
    steps[1] = step("Try one.", ["writing"], [STARTER_PROMPTS[2], "What is your salary?"]);
    expect(tourProblems(tour(steps))).toEqual(["step 2: unknown example question What is your salary?"]);
  });

  it("flags every unknown example question, one line each, and matches exactly (no near misses)", () => {
    const steps = validSteps();
    steps[0] = step("Hi.", [], ["nope", `${STARTER_PROMPTS[0]} `, STARTER_PROMPTS[0].toLowerCase()]);
    expect(tourProblems(tour(steps))).toEqual([
      "step 1: unknown example question nope",
      `step 1: unknown example question ${STARTER_PROMPTS[0]} `,
      `step 1: unknown example question ${STARTER_PROMPTS[0].toLowerCase()}`,
    ]);
  });

  it("flags a repeated example question, by its step number", () => {
    const steps = validSteps();
    steps[1] = step("Try one.", ["writing"], [STARTER_PROMPTS[2], STARTER_PROMPTS[2]]);
    expect(tourProblems(tour(steps))).toEqual(["step 2: repeats an example question"]);
  });

  it("flags fit-mode named in more than one step, once", () => {
    const steps = [step("a", ["fit-mode"]), step("b", ["fit-mode"]), step("c", ["fit-mode"])];
    expect(tourProblems(tour(steps))).toEqual(["fit-mode is named in more than one step"]);
  });

  it("accepts fit-mode in exactly one step, or none", () => {
    expect(tourProblems(tour([step("a", ["ask-button", "fit-mode"]), step("b"), step("c")]))).toEqual([]);
    expect(tourProblems(tour(validSteps()))).toEqual([]);
  });

  it("flags an empty say", () => {
    const steps = validSteps();
    steps[2] = step("", []);
    expect(tourProblems(tour(steps))).toEqual(["step 3: says nothing"]);
  });

  it("flags a say that is only whitespace", () => {
    const steps = validSteps();
    steps[0] = step("  \n ", []);
    expect(tourProblems(tour(steps))).toEqual(["step 1: says nothing"]);
  });

  it("flags a tour with fewer than 3 steps", () => {
    expect(tourProblems(tour([step("a"), step("b")]))).toEqual(["only 2 steps; a tour needs at least 3"]);
    expect(tourProblems(tour([]))).toEqual(["only 0 steps; a tour needs at least 3"]);
  });

  it("accepts exactly 3 steps", () => {
    expect(tourProblems(tour(validSteps()))).toEqual([]);
  });

  it("flags a tour over 120000 ms, with the total in seconds", () => {
    // 9 steps of 200 words hit the 16 s ceiling (144 s); the closing step is 200 words / 12 per s + 1.2 s = 17.9 s.
    const steps = Array.from({ length: 10 }, () => step(words(200)));
    expect(tourDurationMs(tour(steps))).toBe(9 * 16000 + 17867);
    expect(tourProblems(tour(steps))).toEqual(["runs 162s; the limit is 120s"]);
  });

  it("allows a tour that lands exactly on the budget", () => {
    // 7 steps at the 16000 ms ceiling, plus a 24-word step (8000 ms): 120000. The last step shows something, so it
    // keeps its reading time.
    const exact = [step(words(24)), ...Array.from({ length: 5 }, () => step(words(200))), step(words(200)), step(words(200), ["writing"])];
    expect(tourDurationMs(tour(exact))).toBe(TOUR_BUDGET_MS);
    expect(tourProblems(tour(exact))).toEqual([]);
  });

  it("reports several problems together, in step order, with the length problems last", () => {
    const steps = [step("", ["role-nowhere"]), step("b"), ...Array.from({ length: 9 }, () => step(words(200)))];
    expect(tourProblems(tour(steps))).toEqual([
      "step 1: says nothing",
      "step 1: unknown target role-nowhere",
      expect.stringMatching(/^runs \d+s; the limit is 120s$/),
    ]);
  });

  it("reads TOUR_BUDGET_MS as 120 seconds", () => {
    expect(TOUR_BUDGET_MS).toBe(120_000);
  });
});

describe("tourJsonSchema", () => {
  const schema = tourJsonSchema();
  const stepSchema = schema.properties.steps.items;

  it("asks for a list of steps, each with say and targets", () => {
    expect(schema.type).toBe("object");
    expect(schema.properties.steps.type).toBe("array");
    expect(stepSchema.properties.say).toEqual({ type: "string" });
    expect(stepSchema.properties.targets.type).toBe("array");
  });

  it("limits every target to the ids a step may name", () => {
    expect(stepSchema.properties.targets.items.enum).toEqual(TOUR_TARGET_IDS);
    expect(stepSchema.properties.targets.items.type).toBe("string");
  });

  it("is strict at every level: additionalProperties false", () => {
    expect(schema.additionalProperties).toBe(false);
    expect(stepSchema.additionalProperties).toBe(false);
  });

  it("limits every example question to the starter prompts", () => {
    expect(stepSchema.properties.ask.type).toBe("array");
    expect(stepSchema.properties.ask.items).toEqual({ type: "string", enum: STARTER_PROMPTS });
  });

  it("requires every property at every level", () => {
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(stepSchema.required).toEqual(Object.keys(stepSchema.properties));
    expect([...stepSchema.required].sort()).toEqual(["ask", "say", "targets"]);
  });

  it("is plain JSON, so the API accepts it", () => {
    expect(JSON.parse(JSON.stringify(schema))).toEqual(schema);
  });
});

/** Straight quotes and apostrophes, lower case: a re-recording may use either kind. */
const norm = (text: string) =>
  text.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').toLowerCase();
const HIRING_LABEL = norm("I'm hiring \u2014 check my fit for a role");
const WRITING_ASK = [
  "How would you design production-ready agents?",
  "LoRA, RAFT or GRPO: which fine-tuning approach should I use, and when?",
];

describe("SITE_TOUR", () => {
  it("the shipped tour is valid", () => {
    expect(tourProblems(SITE_TOUR)).toEqual([]);
  });

  it("is shaped like a tour", () => {
    expect(typeof SITE_TOUR.draft).toBe("boolean");
    expect(SITE_TOUR.steps.length).toBeGreaterThanOrEqual(3);
    for (const s of SITE_TOUR.steps) {
      expect(typeof s.say).toBe("string");
      expect(Array.isArray(s.targets)).toBe(true);
    }
  });

  it("runs under the two-minute budget", () => {
    expect(tourDurationMs(SITE_TOUR)).toBeLessThanOrEqual(TOUR_BUDGET_MS);
  });

  it("opens by saying the whole site is a tool, and closes by inviting live questions with nothing to show", () => {
    expect(norm(SITE_TOUR.steps[0].say)).toMatch(/whole (web)?site is a tool/);
    expect(SITE_TOUR.steps[0].targets).toEqual([]);
    const last = SITE_TOUR.steps[SITE_TOUR.steps.length - 1];
    expect(norm(last.say)).toMatch(/recorded/);
    expect(last.targets).toEqual([]);
  });

  it("introduces the drawer's own features in its first two steps (they always play in the open drawer)", () => {
    expect(SITE_TOUR.steps[1].targets).toEqual(["ask-button", "fit-mode"]);
  });

  it("records example questions on one step only, the writing step, and no other step has an ask", () => {
    const recordedAsks = (recordedTour.steps as Array<{ ask?: string[] }>).filter((s) => s.ask && s.ask.length > 0);
    expect(recordedAsks).toHaveLength(1);
    for (const s of SITE_TOUR.steps) if (!s.targets.includes("writing")) expect(s.ask ?? []).toEqual([]);
    const withQuestions = SITE_TOUR.steps.filter((s) => s.ask && s.ask.length > 0);
    expect(withQuestions).toHaveLength(1);
    expect(withQuestions[0].targets).toEqual(["writing"]);
    expect(withQuestions[0].ask).toEqual(WRITING_ASK);
  });

  it("has the writing step say it offers examples that are available in Ask Titus after the tour", () => {
    const writing = SITE_TOUR.steps.find((s) => s.targets.includes("writing"))!;
    expect(writing.targets).toEqual(["writing"]);
    expect(norm(writing.say)).toMatch(/example/);
    expect(norm(writing.say)).toMatch(/after/);
  });

  it("tells them in step 2 (the one showing the job-description button) that it stays available after the tour", () => {
    const fit = SITE_TOUR.steps.filter((s) => s.targets.includes("fit-mode"));
    expect(fit).toHaveLength(1);
    expect(fit[0]).toBe(SITE_TOUR.steps[1]);
    expect(norm(fit[0].say)).toMatch(/stays|remain|after(ward)?/);
  });

  it("points out in the last step that it was recorded and where the job-description button is", () => {
    const last = SITE_TOUR.steps[SITE_TOUR.steps.length - 1];
    expect(last.targets).toEqual([]);
    expect(norm(last.say)).toMatch(/recorded/);
    expect(norm(last.say)).toContain(HIRING_LABEL);
  });

  it("still has no problems and runs under 120 s with the longer lines", () => {
    expect(tourProblems(SITE_TOUR)).toEqual([]);
    expect(tourDurationMs(SITE_TOUR)).toBeLessThan(120_000);
  });

  it("names fit-mode in exactly one step, so the job-description button shows once", () => {
    expect(SITE_TOUR.steps.filter((s) => s.targets.includes("fit-mode"))).toHaveLength(1);
  });

  it("every example question is one of the starter prompts", () => {
    for (const q of SITE_TOUR.steps.flatMap((s) => s.ask ?? [])) expect(STARTER_PROMPTS).toContain(q);
  });

  it("tells visitors to click the exact hiring button in step 2", () => {
    const fit = SITE_TOUR.steps.find((s) => s.targets.includes("fit-mode"))!;
    expect(norm(fit.say)).toContain(HIRING_LABEL);
  });

  it("uses the exact degree title in the education step", () => {
    const edu = SITE_TOUR.steps.find((s) => s.targets.includes("edu-smu"));
    expect(edu?.say).toContain("Master of IT in Business (AI track) from Singapore Management University");
  });

  it("is in the site's order: experience, education, projects, writing, about, colophon", () => {
    const flat = SITE_TOUR.steps.flatMap((s) => s.targets);
    const at = (id: string) => flat.indexOf(id);
    const order = ["role-mastercard", "edu-smu", "project-fictional-bassoon", "writing", "tool-langgraph", "colophon-page"].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("is first person, never speaking of Titus in the third person", () => {
    for (const s of SITE_TOUR.steps) expect(s.say).not.toMatch(/\bTitus (is|has|built|works)\b/);
  });
});

describe("TOUR_ON_SITE", () => {
  const env = process.env as Record<string, string | undefined>
  const original = env.NEXT_PUBLIC_VERCEL_ENV
  afterEach(() => {
    if (original === undefined) delete env.NEXT_PUBLIC_VERCEL_ENV
    else env.NEXT_PUBLIC_VERCEL_ENV = original
    jest.dontMock("@/content/site-tour.json")
  })

  /** Loads the module afresh with a given Vercel environment and draft flag. */
  function load(vercelEnv: string | undefined, draft: boolean): boolean {
    if (vercelEnv === undefined) delete env.NEXT_PUBLIC_VERCEL_ENV
    else env.NEXT_PUBLIC_VERCEL_ENV = vercelEnv
    let value = false
    jest.isolateModules(() => {
      jest.doMock("@/content/site-tour.json", () => ({ draft, recordedAt: null, model: null, steps: [] }))
      // isolateModules needs a synchronous load, so this one import is a require().
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      value = require("./site-tour").TOUR_ON_SITE
    })
    return value
  }

  it("is false on the live site (Vercel production) while the tour is a draft", () => {
    expect(load("production", true)).toBe(false)
  })

  it.each(["preview", "development", undefined])("is true while a draft anywhere but production: %s", (vercelEnv) => {
    expect(load(vercelEnv, true)).toBe(true)
  })

  it("is true on the live site once a real recording replaces the draft", () => {
    expect(load("production", false)).toBe(true)
  })

  it("is a boolean, matching the shipped tour in this environment", () => {
    expect(typeof TOUR_ON_SITE).toBe("boolean")
  })
})
