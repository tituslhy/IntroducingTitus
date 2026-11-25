import { PAGE_TARGET_IDS } from "./profile";
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
const step = (say: string, targets: string[] = []): TourStep => ({ say, targets });
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
  it("is words / 3 seconds, plus 1500 ms when the step shows something: 30 words and a target is 11500", () => {
    expect(stepDurationMs(step(words(30), ["role-uob"]))).toBe(11500);
  });

  it("adds no move time to a step that shows nothing: 30 words is 10000", () => {
    expect(stepDurationMs(step(words(30)))).toBe(10000);
  });

  it("counts one move however many things the step shows", () => {
    expect(stepDurationMs(step(words(30), ["role-uob", "role-illumina", "all-roles"]))).toBe(11500);
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
    expect(tourDurationMs(t)).toBe(11500 + 4000 + 10000);
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

  it("requires every property at every level", () => {
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(stepSchema.required).toEqual(Object.keys(stepSchema.properties));
    expect([...stepSchema.required].sort()).toEqual(["say", "targets"]);
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
