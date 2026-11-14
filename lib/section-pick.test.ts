import { SECTION_BUDGET_CHARS } from "./search-config";
import { SECTION_PICK_MS, SECTION_RUBRIC, pickSections, type PickInput, type SectionTrace } from "./section-pick";

type Scores = Record<string, number | null>;
type Opts = NonNullable<Parameters<typeof pickSections>[2]>;

/** A Jev client that scores each question by its section key, and records each request. */
function fakeClient(scores: Scores) {
  return {
    systemOne: jest.fn(async (req: { questions: Record<string, unknown> }) => ({
      answers: Object.fromEntries(Object.keys(req.questions).map((key) => [key, { type: "score", score: scores[key] ?? null }])),
    })),
  };
}

function opts(client: unknown, extra: Partial<Opts> = {}): Opts {
  return { client: client as Opts["client"], ...extra };
}

/** A section of exactly `n` characters under a heading. */
const section = (heading: string, n: number, fill = heading.toLowerCase()) => `### ${heading}\n${fill.repeat(n).slice(0, n)}`;

const input = (body: string, extra: Partial<PickInput> = {}): PickInput => ({ slug: "s", body, ...extra });

describe("section-pick constants", () => {
  it("uses a 6,000-character section budget and a 2-second Jev timeout", () => {
    expect(SECTION_BUDGET_CHARS).toBe(6_000);
    expect(SECTION_PICK_MS).toBe(2_000);
  });

  it("has four rubric levels, 0 to 3", () => {
    expect(SECTION_RUBRIC).toHaveLength(4);
    for (const level of SECTION_RUBRIC) expect(level.trim().length).toBeGreaterThan(0);
  });
});

describe("pickSections", () => {
  it("returns a short article whole, with no Jev call", async () => {
    const client = fakeClient({});
    const onTrace = jest.fn();
    const body = "Intro\n\n### One\nA\n### Two\nB";

    const picked = await pickSections(input(body), "q", opts(client, { onTrace }));

    expect(picked).toEqual({
      outline: [],
      sections: [
        { heading: null, text: "Intro" },
        { heading: "One", text: "A" },
        { heading: "Two", text: "B" },
      ],
      truncated: false,
    });
    expect(client.systemOne).not.toHaveBeenCalled();
    expect(onTrace.mock.calls[0][0]).toMatchObject({ fallback: "short" });
  });

  it("treats an article exactly at the default budget as short, and one character over as needing a pick", async () => {
    const atBudget = input(section("A", 3_000) + "\n" + section("B", 3_000));
    const clientAt = fakeClient({});
    expect(await pickSections(atBudget, "q", opts(clientAt))).toMatchObject({ truncated: false });
    expect(clientAt.systemOne).not.toHaveBeenCalled();

    const over = input(section("A", 3_500) + "\n" + section("B", 3_500));
    const clientOver = fakeClient({ A: 1, B: 2 });
    const picked = await pickSections(over, "q", opts(clientOver));
    expect(clientOver.systemOne).toHaveBeenCalledTimes(1);
    expect(picked.sections.map((s) => s.heading)).toEqual(["B"]);
    expect(picked.truncated).toBe(true);
  });

  it("picks the top-scored sections that fit, and returns them in article order", async () => {
    // Three 8-character sections, budget 20: only two fit. Scores pick B and C; A is left out.
    const body = [section("A", 8), section("B", 8), section("C", 8)].join("\n");
    const client = fakeClient({ A: 1, B: 3, C: 2 });

    const picked = await pickSections(input(body), "q", opts(client, { budget: 20 }));

    expect(picked.sections).toEqual([
      { heading: "B", text: "bbbbbbbb" },
      { heading: "C", text: "cccccccc" },
    ]);
    expect(picked.truncated).toBe(true);
    expect(client.systemOne).toHaveBeenCalledTimes(1);
  });

  it("always includes the intro, truncated to a third of the budget", async () => {
    // Budget 30: the intro is cut to 10, leaving 20 for sections. A (20) fits; B does not.
    const body = ["I".repeat(25), "", section("A", 20), section("B", 20)].join("\n");
    const client = fakeClient({ A: 3, B: 1 });

    const picked = await pickSections(input(body), "q", opts(client, { budget: 30 }));

    expect(picked.sections).toEqual([
      { heading: null, text: "I".repeat(10) },
      { heading: "A", text: "a".repeat(20) },
    ]);
    expect(picked.truncated).toBe(true);
  });

  it("returns the best section truncated to the budget when none fit", async () => {
    const body = [section("A", 30), section("B", 30)].join("\n");
    const client = fakeClient({ A: 1, B: 3 });

    const picked = await pickSections(input(body), "q", opts(client, { budget: 10 }));

    expect(picked).toEqual({ outline: [], sections: [{ heading: "B", text: "b".repeat(10) }], truncated: true });
  });

  it("judges on headings alone when sectionNotes is absent, without throwing", async () => {
    const body = [section("A", 8), section("B", 8)].join("\n");
    const client = fakeClient({ A: 1, B: 2 });

    const picked = await pickSections(input(body), "q", opts(client, { budget: 10 }));

    expect(picked.sections).toEqual([{ heading: "B", text: "bbbbbbbb" }]);
    expect(client.systemOne).toHaveBeenCalledTimes(1);
    const sent = JSON.stringify(client.systemOne.mock.calls[0][0]);
    expect(sent).toContain('"heading":"A"');
    expect(sent).toContain('"note":null');
  });

  it("passes each section's note to the judge when sectionNotes is present", async () => {
    const body = [section("A", 8), section("B", 8)].join("\n");
    const client = fakeClient({ A: 1, B: 2 });

    await pickSections(input(body, { sectionNotes: { A: "Covers retrieval trade-offs" } }), "q", opts(client, { budget: 10 }));

    const sent = JSON.stringify(client.systemOne.mock.calls[0][0]);
    expect(sent).toContain("Covers retrieval trade-offs");
    expect(sent).toContain('"note":null');
  });

  it("falls back to article order when Jev fails, keeping the sections that fit", async () => {
    const body = [section("A", 8), section("B", 8), section("C", 8)].join("\n");
    const client = { systemOne: jest.fn(async () => Promise.reject(new Error("Jev down"))) };
    const onTrace = jest.fn();

    const picked = await pickSections(input(body), "q", opts(client, { budget: 20, onTrace }));

    expect(picked.sections.map((s) => s.heading)).toEqual(["A", "B"]);
    expect(picked.truncated).toBe(true);
    expect(onTrace.mock.calls[0][0]).toMatchObject({ fallback: "jev_failed" });
  });

  it("truncates a long intro-only article to the full budget", async () => {
    const picked = await pickSections(input("x".repeat(500)), "q", opts(fakeClient({}), { budget: 100 }));

    expect(picked).toEqual({ outline: [], sections: [{ heading: null, text: "x".repeat(100) }], truncated: true });
  });

  it("returns the outline from the article, and [] when it has none", async () => {
    const client = fakeClient({});

    expect((await pickSections(input("Short"), "q", opts(client))).outline).toEqual([]);
    expect(
      (await pickSections(input("Short", { outline: ["One", "Two"] }), "q", opts(client))).outline
    ).toEqual(["One", "Two"]);
  });

  it("reports a SectionTrace through onTrace for a picked article", async () => {
    const body = [section("A", 8), section("B", 8)].join("\n");
    const client = fakeClient({ A: 1, B: 3 });
    const onTrace = jest.fn<void, [SectionTrace]>();

    await pickSections(input(body), "guardrails", opts(client, { budget: 10, onTrace }));

    expect(onTrace).toHaveBeenCalledTimes(1);
    const trace = onTrace.mock.calls[0][0];
    expect(trace).toMatchObject({
      slug: "s",
      focus: "guardrails",
      chosen: ["B"],
      fallback: "none",
    });
    expect(trace.scored).toEqual(
      expect.arrayContaining([
        { key: "A", score: 1 },
        { key: "B", score: 3 },
      ])
    );
    expect(typeof trace.startedAt).toBe("number");
    expect(typeof trace.ms).toBe("number");
  });

  it("ranks a null score last, below any real score", async () => {
    // Only one 8-character section fits 10. A has no valid score; B scores 0, which still beats null.
    const body = [section("A", 8), section("B", 8)].join("\n");
    const client = fakeClient({ A: null, B: 0 });

    const picked = await pickSections(input(body), "q", opts(client, { budget: 10 }));

    expect(picked.sections).toEqual([{ heading: "B", text: "bbbbbbbb" }]);
  });
});
