import { createCopilotTools, parseSearchWritingQuery, parseShowOnPageTarget, type CopilotTool } from "./copilot-tools";
import { PAGE_TARGET_IDS } from "./profile";
import type { SearchTrace } from "./writing-search";
import type { TraceSpan } from "./copilot-loop";

describe("parseShowOnPageTarget", () => {
  it("returns the target when it is a valid page anchor id", () => {
    expect(parseShowOnPageTarget('{"target":"role-illumina"}')).toBe("role-illumina");
  });

  it("accepts every anchor id the page exposes", () => {
    for (const id of PAGE_TARGET_IDS) {
      expect(parseShowOnPageTarget(JSON.stringify({ target: id }))).toBe(id);
    }
  });

  it("returns null for a well-formed target that is not a page anchor", () => {
    expect(parseShowOnPageTarget('{"target":"role-nasa"}')).toBeNull();
  });

  it("is case-sensitive and does not trim whitespace", () => {
    expect(parseShowOnPageTarget('{"target":"ROLE-ILLUMINA"}')).toBeNull();
    expect(parseShowOnPageTarget('{"target":" role-illumina"}')).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseShowOnPageTarget("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseShowOnPageTarget('{"target":')).toBeNull();
    expect(parseShowOnPageTarget("not json")).toBeNull();
  });

  it.each([
    ["null", "null"],
    ["a bare string", '"role-illumina"'],
    ["a number", "42"],
    ["an array", '["role-illumina"]'],
  ])("returns null when the arguments parse to %s", (_label, raw) => {
    expect(parseShowOnPageTarget(raw)).toBeNull();
  });

  it("returns null when target is missing", () => {
    expect(parseShowOnPageTarget("{}")).toBeNull();
  });

  it.each([
    ["a number", '{"target":5}'],
    ["null", '{"target":null}'],
    ["an array", '{"target":["role-illumina"]}'],
    ["an object", '{"target":{"id":"role-illumina"}}'],
  ])("returns null when target is not a string (%s)", (_label, raw) => {
    expect(parseShowOnPageTarget(raw)).toBeNull();
  });
});

describe("show_on_page tool run", () => {
  function getShowOnPage(): CopilotTool {
    const tool = createCopilotTools().find((t) => t.definition.name === "show_on_page");
    if (!tool) throw new Error("show_on_page is not registered");
    return tool;
  }

  it("emits exactly one action event for the target and returns what was shown", async () => {
    const tool = getShowOnPage();
    const emit = jest.fn();
    const signal = new AbortController().signal;

    const result = await tool.run("role-illumina", { emit, signal });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith({ type: "action", target: "role-illumina" });
    expect(result).toEqual({ shown: "role-illumina" });
  });
});

describe("createCopilotTools", () => {
  it("registers show_on_page (one call per reply) and search_writing (two), in that order", () => {
    const tools = createCopilotTools();

    expect(tools.map((t) => t.definition.name)).toEqual(["show_on_page", "search_writing"]);
    expect(tools[0].maxCallsPerReply).toBe(1);
    expect(tools[1].maxCallsPerReply).toBe(2);
  });

  it("defines show_on_page as a strict function tool with the page anchor ids as its enum", () => {
    const { definition } = createCopilotTools()[0];

    expect(definition).toMatchObject({ type: "function", name: "show_on_page", strict: true });
    expect(definition.parameters).toMatchObject({
      type: "object",
      required: ["target"],
      additionalProperties: false,
      properties: { target: { type: "string" } },
    });
    expect((definition.parameters as { properties: { target: { enum: string[] } } }).properties.target.enum).toEqual(
      PAGE_TARGET_IDS
    );
  });

  it("returns fresh tool instances on each call so per-reply state is not shared", () => {
    const first = createCopilotTools();
    const second = createCopilotTools();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });

  it("wires the tool's parse to the same validation as parseShowOnPageTarget", () => {
    const tool = createCopilotTools()[0];

    expect(tool.parse('{"target":"role-illumina"}')).toBe("role-illumina");
    expect(tool.parse('{"target":"role-nasa"}')).toBeNull();
    expect(tool.parse("{")).toBeNull();
  });
});

describe("parseSearchWritingQuery", () => {
  it("returns the query, trimmed", () => {
    expect(parseSearchWritingQuery('{"query":"  guardrails for agents  "}')).toBe("guardrails for agents");
  });

  it("returns null for an empty or whitespace-only query", () => {
    expect(parseSearchWritingQuery('{"query":""}')).toBeNull();
    expect(parseSearchWritingQuery('{"query":"   "}')).toBeNull();
  });

  it("caps the query at 300 characters", () => {
    expect(parseSearchWritingQuery(JSON.stringify({ query: "a".repeat(400) }))).toHaveLength(300);
  });

  it("returns null when query is missing or not a string", () => {
    expect(parseSearchWritingQuery("{}")).toBeNull();
    expect(parseSearchWritingQuery('{"query":42}')).toBeNull();
    expect(parseSearchWritingQuery('{"query":["a"]}')).toBeNull();
  });

  it("returns null for malformed JSON and for non-object JSON", () => {
    expect(parseSearchWritingQuery('{"query":')).toBeNull();
    expect(parseSearchWritingQuery("null")).toBeNull();
    expect(parseSearchWritingQuery('"guardrails"')).toBeNull();
  });
});

describe("search_writing tool", () => {
  const signal = new AbortController().signal;

  function found(slug: string) {
    return {
      slug,
      title: `Title ${slug}`,
      url: `https://medium.com/@tituslhy/${slug}`,
      body: `Body of ${slug}`,
      relevance: 0.9,
      score: 2.5,
    };
  }

  function getSearchTool(search: jest.Mock): CopilotTool {
    const tool = createCopilotTools({ search }).find((t) => t.definition.name === "search_writing");
    if (!tool) throw new Error("search_writing is not registered");
    return tool;
  }

  it("defines search_writing as a strict function tool taking a required query", () => {
    const tool = getSearchTool(jest.fn());

    expect(tool.definition).toMatchObject({ type: "function", name: "search_writing", strict: true });
    expect(tool.definition.parameters).toMatchObject({
      type: "object",
      required: ["query"],
      additionalProperties: false,
      properties: { query: { type: "string" } },
    });
  });

  it("passes the query, the abort signal and a trace hook to the search", async () => {
    const search = jest.fn(async () => []);
    const emit = jest.fn();

    await getSearchTool(search).run("guardrails", { emit, signal });

    expect(search).toHaveBeenCalledWith(
      "guardrails",
      expect.objectContaining({ signal, onTrace: expect.any(Function) })
    );
  });

  it("numbers articles per reply, keeping an article's first number when it is found again", async () => {
    const search = jest
      .fn()
      .mockResolvedValueOnce([found("a"), found("b")])
      .mockResolvedValueOnce([found("b"), found("c")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();

    const first = await tool.run("first query", { emit, signal });
    const second = await tool.run("second query", { emit, signal });

    expect(first).toEqual({
      articles: [
        { n: 1, title: "Title a", url: "https://medium.com/@tituslhy/a", body: "Body of a" },
        { n: 2, title: "Title b", url: "https://medium.com/@tituslhy/b", body: "Body of b" },
      ],
    });
    expect(second).toEqual({
      articles: [
        { n: 2, title: "Title b", url: "https://medium.com/@tituslhy/b", body: "Body of b" },
        { n: 3, title: "Title c", url: "https://medium.com/@tituslhy/c", body: "Body of c" },
      ],
    });
  });

  it("emits one source event per new article, with the drawer's fields and no body", async () => {
    const search = jest
      .fn()
      .mockResolvedValueOnce([found("a"), found("b")])
      .mockResolvedValueOnce([found("b"), found("c")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();

    await tool.run("first", { emit, signal });
    await tool.run("second", { emit, signal });

    expect(emit.mock.calls.map((c) => c[0])).toEqual([
      { type: "source", n: 1, title: "Title a", url: "https://medium.com/@tituslhy/a", relevance: 0.9, score: 2.5 },
      { type: "source", n: 2, title: "Title b", url: "https://medium.com/@tituslhy/b", relevance: 0.9, score: 2.5 },
      { type: "source", n: 3, title: "Title c", url: "https://medium.com/@tituslhy/c", relevance: 0.9, score: 2.5 },
    ]);
    for (const [event] of emit.mock.calls) {
      expect(event).not.toHaveProperty("body");
    }
  });

  it("includes coAuthors in the tool output for a joint article, and omits it otherwise", async () => {
    const joint = { ...found("joint"), coAuthors: ["Jane Doe"] };
    const search = jest.fn().mockResolvedValueOnce([joint, found("solo")]);
    const tool = getSearchTool(search);

    const result = (await tool.run("q", { emit: jest.fn(), signal })) as {
      articles: Array<Record<string, unknown>>;
    };

    expect(result.articles[0]).toMatchObject({ n: 1, coAuthors: ["Jane Doe"] });
    expect(result.articles[1]).not.toHaveProperty("coAuthors");
  });

  it("never puts coAuthors on a source event", async () => {
    const joint = { ...found("joint"), coAuthors: ["Jane Doe"] };
    const search = jest.fn().mockResolvedValueOnce([joint]);
    const emit = jest.fn();

    await getSearchTool(search).run("q", { emit, signal });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toHaveProperty("type", "source");
    expect(emit.mock.calls[0][0]).not.toHaveProperty("coAuthors");
  });

  it("returns an empty result with a note, and emits nothing, when no article covers the query", async () => {
    const tool = getSearchTool(jest.fn(async () => []));
    const emit = jest.fn();

    const result = await tool.run("something I never wrote about", { emit, signal });

    expect(result).toEqual({ articles: [], note: "No article of mine covers this." });
    expect(emit).not.toHaveBeenCalled();
  });

  it("rejects when the search itself throws, so the loop can report tool failed", async () => {
    const tool = getSearchTool(jest.fn(async () => Promise.reject(new Error("boom"))));

    await expect(tool.run("q", { emit: jest.fn(), signal })).rejects.toThrow("boom");
  });

  it("logs a copilot_writing_search line with timings and slugs, but never the query or article text", async () => {
    const logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    const search = jest.fn(async (_query: string, options: { onTrace?: (t: unknown) => void }) => {
      options.onTrace?.({
        model: "jev-test",
        shortlist: [{ slug: "a", relevance: 0.9 }],
        stage1Ms: 10,
        stage2Ms: 20,
        totalMs: 31,
        fallback: "none",
        errors: [],
      });
      return [found("a")];
    });

    try {
      await getSearchTool(search).run("secret-query-marker", { emit: jest.fn(), signal });

      const line = logSpy.mock.calls.map((c) => String(c[0])).find((l) => l.includes("copilot_writing_search"));
      expect(line).toBeDefined();
      expect(JSON.parse(line!)).toEqual({
        event: "copilot_writing_search",
        model: "jev-test",
        stage1Ms: 10,
        stage2Ms: 20,
        totalMs: 31,
        shortlisted: 1,
        fallback: "none",
        errors: [],
      });
      expect(line).not.toContain("secret-query-marker");
      expect(line).not.toContain("Body of a");
    } finally {
      logSpy.mockRestore();
    }
  });

  it("starts numbering from 1 in each new createCopilotTools() instance", async () => {
    const search = jest.fn(async () => [found("a")]);
    const first = getSearchTool(search);
    const second = getSearchTool(search);

    expect(await first.run("q", { emit: jest.fn(), signal })).toMatchObject({ articles: [{ n: 1 }] });
    expect(await first.run("q", { emit: jest.fn(), signal })).toMatchObject({ articles: [{ n: 1 }] });
    expect(await second.run("q", { emit: jest.fn(), signal })).toMatchObject({ articles: [{ n: 1 }] });
  });
});

describe("search_writing trace steps", () => {
  const signal = new AbortController().signal;

  function fakeSpan() {
    return { annotate: jest.fn(), step: jest.fn(), end: jest.fn(), fail: jest.fn() };
  }

  function searchTrace(overrides: Partial<SearchTrace> = {}): SearchTrace {
    return {
      model: "jev-test",
      shortlist: [
        { slug: "a", relevance: 0.9 },
        { slug: "b", relevance: 0.8 },
      ],
      stage1Ms: 100,
      stage2Ms: 50,
      totalMs: 160,
      fallback: "none",
      errors: [],
      startedAt: 1_000,
      catalogSize: 65,
      ranked: [
        { slug: "a", score: 2.5 },
        { slug: "b", score: null },
      ],
      ...overrides,
    };
  }

  const found = (slug: string, score: number | null = 2.5) => ({
    slug,
    title: `Title ${slug}`,
    url: `https://medium.com/@tituslhy/${slug}`,
    body: `Body ${slug}`,
    relevance: 0.9,
    score,
  });

  /** A search_writing tool whose search reports `trace` and returns `articles`. */
  function toolReporting(trace: SearchTrace | null, articles: ReturnType<typeof found>[] = [found("a")]) {
    const search = jest.fn(async (_q: string, options: { onTrace?: (t: SearchTrace) => void }) => {
      if (trace) options.onTrace?.(trace);
      return articles;
    });
    const tool = createCopilotTools({ search }).find((t) => t.definition.name === "search_writing")!;
    return { tool, search };
  }

  it("records the Jev filter step with the query, catalog size, shortlist and timings", async () => {
    const { tool } = toolReporting(searchTrace());
    const span = fakeSpan();

    await tool.run("guardrails", { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.step).toHaveBeenCalledWith("jev filter (noul)", {
      inputs: { query: "guardrails", articles: 65 },
      outputs: {
        model: "jev-test",
        shortlist: [
          { slug: "a", relevance: 0.9 },
          { slug: "b", relevance: 0.8 },
        ],
      },
      startTime: 1_000,
      endTime: 1_100,
      error: undefined,
    });
  });

  it("records the Jev rank step only when stage 2 ran, with its shortlist, ranked scores and timings", async () => {
    const { tool } = toolReporting(searchTrace());
    const span = fakeSpan();

    await tool.run("guardrails", { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    const rank = span.step.mock.calls.find((c) => c[0] === "jev rank (score)");
    expect(rank).toBeDefined();
    expect(rank![1]).toEqual({
      inputs: { query: "guardrails", shortlist: ["a", "b"] },
      outputs: { ranked: [{ slug: "a", score: 2.5 }, { slug: "b", score: null }] },
      startTime: 1_100,
      endTime: 1_150,
      error: undefined,
    });
  });

  it("does not record a rank step when stage 2 was skipped", async () => {
    const { tool } = toolReporting(searchTrace({ stage2Ms: null, ranked: [], fallback: "single" }));
    const span = fakeSpan();

    await tool.run("q", { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    const names = span.step.mock.calls.map((c) => c[0]);
    expect(names).toEqual(["jev filter (noul)"]);
  });

  it("puts the errors on the filter step when stage 1 failed", async () => {
    const { tool } = toolReporting(searchTrace({ fallback: "stage1_failed", errors: ["InternalServerError"], stage2Ms: null, ranked: [], shortlist: [] }), []);
    const span = fakeSpan();

    await tool.run("q", { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.step.mock.calls[0][1]).toMatchObject({ error: "InternalServerError" });
    expect(span.step).toHaveBeenCalledTimes(1);
  });

  it("puts the errors on the rank step when stage 2 failed, and leaves the filter step clean", async () => {
    const { tool } = toolReporting(
      searchTrace({ fallback: "stage2_failed", errors: ["NoValidScores"] }),
      [found("a", null)]
    );
    const span = fakeSpan();

    await tool.run("q", { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    const filter = span.step.mock.calls.find((c) => c[0] === "jev filter (noul)")![1];
    const rank = span.step.mock.calls.find((c) => c[0] === "jev rank (score)")![1];
    expect(filter.error).toBeUndefined();
    expect(rank.error).toBe("NoValidScores");
  });

  it("annotates the span with the fallback, timing, errors and the articles it chose", async () => {
    const { tool } = toolReporting(searchTrace({ errors: [] }), [found("a", 2.5), found("b", null)]);
    const span = fakeSpan();

    await tool.run("q", { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.annotate).toHaveBeenCalledWith({
      search: {
        fallback: "none",
        totalMs: 160,
        errors: [],
        chosen: [
          { slug: "a", relevance: 0.9, score: 2.5 },
          { slug: "b", relevance: 0.9, score: null },
        ],
      },
    });
  });

  it("records nothing when there is no trace span, and the tool output is unchanged", async () => {
    const withSpan = toolReporting(searchTrace());
    const without = toolReporting(searchTrace());
    const span = fakeSpan();

    const traced = await withSpan.tool.run("q", { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });
    const untraced = await without.tool.run("q", { emit: jest.fn(), signal });

    expect(untraced).toEqual(traced);
    expect(span.step).toHaveBeenCalled();
  });

  it("records nothing when the search never reports a trace", async () => {
    const { tool } = toolReporting(null);
    const span = fakeSpan();

    await tool.run("q", { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.step).not.toHaveBeenCalled();
    expect(span.annotate).not.toHaveBeenCalled();
  });
});
