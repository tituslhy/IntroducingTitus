import { PAGE_TARGET_IDS } from "./profile";
import { STARTER_PROMPTS } from "./starter-prompts";
import recordedTour from "@/content/site-tour.json";
import {
  DRAWER_TARGET_IDS,
  SITE_TOUR,
  TOUR_ON_SITE,
  TOUR_BUDGET_MS,
  TOUR_TARGET_IDS,
  parseTour,
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

describe("tourDurationMs", () => {
  it("sums its steps", () => {
    const t = tour([step(words(30), ["role-uob"]), step(words(3)), step(words(30))]);
    expect(tourDurationMs(t)).toBe(12000 + 4000 + 10000);
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
    // 10 steps of 200 words hit the 16 s ceiling: 160 s.
    const steps = Array.from({ length: 10 }, () => step(words(200)));
    expect(tourProblems(tour(steps))).toEqual(["runs 160s; the limit is 120s"]);
  });

  it("allows a tour that lands exactly on the budget", () => {
    // 7 steps at the 16000 ms ceiling, plus a 24-word step (8000 ms): 120000.
    const exact = [...Array.from({ length: 7 }, () => step(words(200))), step(words(24))];
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
    expect(SITE_TOUR.steps[0].say).toMatch(/whole website is a tool/i);
    expect(SITE_TOUR.steps[0].targets).toEqual([]);
    const last = SITE_TOUR.steps[SITE_TOUR.steps.length - 1];
    expect(last.say).toMatch(/recorded/i);
    expect(last.targets).toEqual([]);
  });

  it("introduces the drawer's own features in its first two steps (they always play in the open drawer)", () => {
    expect(SITE_TOUR.steps[1].targets).toEqual(["ask-button", "fit-mode"]);
  });

  it("records example questions on one step only (the file leaves ask off the rest), the writing step", () => {
    const recordedAsks = (recordedTour.steps as Array<{ ask?: string[] }>).filter((s) => "ask" in s);
    expect(recordedAsks).toHaveLength(1);
    for (const s of SITE_TOUR.steps) if (!s.targets.includes("writing")) expect("ask" in s).toBe(false);
    const withQuestions = SITE_TOUR.steps.filter((s) => s.ask && s.ask.length > 0);
    expect(withQuestions).toHaveLength(1);
    expect(withQuestions[0].targets).toEqual(["writing"]);
    expect(withQuestions[0].say).toContain("I can answer questions on any of them; try one of these.");
    expect(withQuestions[0].ask).toEqual([
      "How would you build production-ready agents?",
      "LoRA, RAFT or GRPO: which fine-tuning approach should I use, and when?",
    ]);
  });

  it("tells them in step 2 that the job-description button stays in Ask Titus after the tour", () => {
    const say = SITE_TOUR.steps[1].say;
    expect(say).toContain("I\u2019m hiring \u2014 check my fit for a role");
    expect(say).toContain("That button stays in Ask Titus after this tour.");
    expect(say.indexOf("That button stays in Ask Titus after this tour.")).toBeGreaterThan(say.indexOf("I\u2019ll honestly say how I fit."));
  });

  it("points out in the last step that the job-description button is right below", () => {
    const last = SITE_TOUR.steps[SITE_TOUR.steps.length - 1].say;
    expect(last).toContain("watch me drive the site live");
    expect(last).toContain("\u201cI\u2019m hiring \u2014 check my fit for a role\u201d is right below whenever you need it.");
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
    expect(SITE_TOUR.steps[1].say).toContain("“I’m hiring — check my fit for a role”");
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
