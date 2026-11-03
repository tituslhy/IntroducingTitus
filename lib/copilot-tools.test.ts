import { createCopilotTools, parseSearchWritingArgs, parseShowOnPageTarget, type CopilotTool } from "./copilot-tools";
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

describe("parseSearchWritingArgs", () => {
  it("returns the query, trimmed, with more", () => {
    expect(parseSearchWritingArgs('{"query":"  guardrails for agents  ","more":false}')).toEqual({
      query: "guardrails for agents",
      more: false,
    });
  });

  it("defaults more to false when it is missing", () => {
    expect(parseSearchWritingArgs('{"query":"guardrails"}')).toEqual({ query: "guardrails", more: false });
  });

  it("keeps more: true", () => {
    expect(parseSearchWritingArgs('{"query":"guardrails","more":true}')).toEqual({ query: "guardrails", more: true });
  });

  it.each([
    ["a string", '{"query":"guardrails","more":"yes"}'],
    ["a number", '{"query":"guardrails","more":1}'],
  ])("returns null when more is not a boolean (%s)", (_label, raw) => {
    expect(parseSearchWritingArgs(raw)).toBeNull();
  });

  it("returns null for an empty or whitespace-only query", () => {
    expect(parseSearchWritingArgs('{"query":"","more":false}')).toBeNull();
    expect(parseSearchWritingArgs('{"query":"   ","more":true}')).toBeNull();
  });

  it("caps the query at 300 characters", () => {
    expect(parseSearchWritingArgs(JSON.stringify({ query: "a".repeat(400) }))?.query).toHaveLength(300);
  });

  it("returns null when query is missing or not a string", () => {
    expect(parseSearchWritingArgs("{}")).toBeNull();
    expect(parseSearchWritingArgs('{"more":false}')).toBeNull();
    expect(parseSearchWritingArgs('{"query":42,"more":false}')).toBeNull();
    expect(parseSearchWritingArgs('{"query":["a"]}')).toBeNull();
  });

  it("returns null for malformed JSON and for non-object JSON", () => {
    expect(parseSearchWritingArgs('{"query":')).toBeNull();
    expect(parseSearchWritingArgs("null")).toBeNull();
    expect(parseSearchWritingArgs('"guardrails"')).toBeNull();
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

  it("defines search_writing as a strict function tool taking a required query and more", () => {
    const tool = getSearchTool(jest.fn());

    expect(tool.definition).toMatchObject({ type: "function", name: "search_writing", strict: true });
    expect(tool.definition.parameters).toMatchObject({
      type: "object",
      required: ["query", "more"],
      additionalProperties: false,
      properties: { query: { type: "string" }, more: { type: "boolean" } },
    });
  });

  it("passes the query, the abort signal and a trace hook to the search", async () => {
    const search = jest.fn(async () => []);
    const emit = jest.fn();

    await getSearchTool(search).run({ query: "guardrails", more: false }, { emit, signal });

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

    const first = await tool.run({ query: "first query", more: false }, { emit, signal });
    const second = await tool.run({ query: "second query", more: false }, { emit, signal });

    expect(first).toEqual({
      articles: [
        { n: 1, title: "Title a", url: "https://medium.com/@tituslhy/a", body: "Body of a" },
        { n: 2, title: "Title b", url: "https://medium.com/@tituslhy/b", body: "Body of b" },
      ],
      remaining: 0,
    });
    expect(second).toEqual({
      articles: [
        { n: 2, title: "Title b", url: "https://medium.com/@tituslhy/b", body: "Body of b" },
        { n: 3, title: "Title c", url: "https://medium.com/@tituslhy/c", body: "Body of c" },
      ],
      remaining: 0,
    });
  });

  it("emits one source event per new article, with the drawer's fields and no body", async () => {
    const search = jest
      .fn()
      .mockResolvedValueOnce([found("a"), found("b")])
      .mockResolvedValueOnce([found("b"), found("c")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();

    await tool.run({ query: "first", more: false }, { emit, signal });
    await tool.run({ query: "second", more: false }, { emit, signal });

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

    const result = (await tool.run({ query: "q", more: false }, { emit: jest.fn(), signal })) as {
      articles: Array<Record<string, unknown>>;
    };

    expect(result.articles[0]).toMatchObject({ n: 1, coAuthors: ["Jane Doe"] });
    expect(result.articles[1]).not.toHaveProperty("coAuthors");
  });

  it("never puts coAuthors on a source event", async () => {
    const joint = { ...found("joint"), coAuthors: ["Jane Doe"] };
    const search = jest.fn().mockResolvedValueOnce([joint]);
    const emit = jest.fn();

    await getSearchTool(search).run({ query: "q", more: false }, { emit, signal });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toHaveProperty("type", "source");
    expect(emit.mock.calls[0][0]).not.toHaveProperty("coAuthors");
  });

  it("returns an empty result with a note, and emits nothing, when no article covers the query", async () => {
    const tool = getSearchTool(jest.fn(async () => []));
    const emit = jest.fn();

    const result = await tool.run({ query: "something I never wrote about", more: false }, { emit, signal });

    expect(result).toEqual({ articles: [], note: "No article of mine covers this." });
    expect(emit).not.toHaveBeenCalled();
  });

  it("rejects when the search itself throws, so the loop can report tool failed", async () => {
    const tool = getSearchTool(jest.fn(async () => Promise.reject(new Error("boom"))));

    await expect(tool.run({ query: "q", more: false }, { emit: jest.fn(), signal })).rejects.toThrow("boom");
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
      await getSearchTool(search).run({ query: "secret-query-marker", more: false }, { emit: jest.fn(), signal });

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

    expect(await first.run({ query: "q", more: false }, { emit: jest.fn(), signal })).toMatchObject({ articles: [{ n: 1 }] });
    expect(await first.run({ query: "q", more: false }, { emit: jest.fn(), signal })).toMatchObject({ articles: [{ n: 1 }] });
    expect(await second.run({ query: "q", more: false }, { emit: jest.fn(), signal })).toMatchObject({ articles: [{ n: 1 }] });
  });
});

describe("search_writing paging", () => {
  const signal = new AbortController().signal;
  const MORE_NOTE = "No more articles of mine on this.";

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

  /** What the model sees for one article. */
  function out(slug: string, n: number) {
    return { n, title: `Title ${slug}`, url: `https://medium.com/@tituslhy/${slug}`, body: `Body of ${slug}` };
  }

  function getSearchTool(search: jest.Mock): CopilotTool {
    const tool = createCopilotTools({ search }).find((t) => t.definition.name === "search_writing");
    if (!tool) throw new Error("search_writing is not registered");
    return tool;
  }

  it("serves the first two articles of a new search, with the count still to come", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c"), found("d"), found("e")]);

    const result = await getSearchTool(search).run({ query: "guardrails", more: false }, { emit: jest.fn(), signal });

    expect(result).toEqual({ articles: [out("a", 1), out("b", 2)], remaining: 3 });
  });

  it("serves the next two on more: true from the stored ranking, without searching again", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c"), found("d"), found("e")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();

    await tool.run({ query: "guardrails", more: false }, { emit, signal });
    const second = await tool.run({ query: "ignored on a follow-up", more: true }, { emit, signal });

    expect(search).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ articles: [out("c", 3), out("d", 4)], remaining: 1 });
  });

  it("returns the exhausted note once every stored article has been served", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();
    const next = { query: "guardrails", more: true };

    await tool.run({ query: "guardrails", more: false }, { emit, signal });
    expect(await tool.run(next, { emit, signal })).toEqual({ articles: [out("c", 3)], remaining: 0 });
    const exhausted = await tool.run(next, { emit, signal });

    expect(exhausted).toEqual({ articles: [], note: MORE_NOTE });
    expect(exhausted).not.toHaveProperty("remaining");
    expect(search).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(3);
  });

  it("runs a fresh search with the query when more is true but no search has run yet", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c")]);

    const result = await getSearchTool(search).run({ query: "guardrails", more: true }, { emit: jest.fn(), signal });

    expect(search).toHaveBeenCalledWith("guardrails", expect.objectContaining({ signal }));
    expect(result).toEqual({ articles: [out("a", 1), out("b", 2)], remaining: 1 });
  });

  it("returns the exhausted note on more: true after a search that found nothing, without searching again", async () => {
    const search = jest.fn(async () => []);
    const tool = getSearchTool(search);

    await tool.run({ query: "something I never wrote about", more: false }, { emit: jest.fn(), signal });
    const next = await tool.run({ query: "something I never wrote about", more: true }, { emit: jest.fn(), signal });

    expect(next).toEqual({ articles: [], note: MORE_NOTE });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("continues numbering across pages and emits source events for the new page only", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c"), found("d")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();

    await tool.run({ query: "q", more: false }, { emit, signal });
    emit.mockClear();
    const second = await tool.run({ query: "q", more: true }, { emit, signal });

    expect(second).toEqual({ articles: [out("c", 3), out("d", 4)], remaining: 0 });
    expect(emit.mock.calls.map((c) => c[0])).toEqual([
      { type: "source", n: 3, title: "Title c", url: "https://medium.com/@tituslhy/c", relevance: 0.9, score: 2.5 },
      { type: "source", n: 4, title: "Title d", url: "https://medium.com/@tituslhy/d", relevance: 0.9, score: 2.5 },
    ]);
  });

  it("discards the previous ranking when a new search (more: false) runs", async () => {
    const search = jest
      .fn()
      .mockResolvedValueOnce([found("a"), found("b"), found("c")])
      .mockResolvedValueOnce([found("x")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();

    await tool.run({ query: "first", more: false }, { emit, signal });
    const second = await tool.run({ query: "second", more: false }, { emit, signal });
    const next = await tool.run({ query: "second", more: true }, { emit, signal });

    expect(second).toEqual({ articles: [out("x", 3)], remaining: 0 });
    expect(next).toEqual({ articles: [], note: MORE_NOTE });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("parses the raw arguments with parseSearchWritingArgs, defaulting more to false", () => {
    const tool = getSearchTool(jest.fn());

    expect(tool.parse('{"query":"guardrails","more":true}')).toEqual({ query: "guardrails", more: true });
    expect(tool.parse('{"query":"guardrails"}')).toEqual({ query: "guardrails", more: false });
    expect(tool.parse('{"query":"guardrails","more":"yes"}')).toBeNull();
  });
});

describe("search_writing when the search fails", () => {
  const signal = new AbortController().signal;
  const NOTE = "No article of mine covers this.";
  const MORE_NOTE = "No more articles of mine on this.";

  /** A search that reports `fallback` through onTrace and finds nothing. */
  function emptySearchReporting(fallback: SearchTrace["fallback"]) {
    return jest.fn(async (_q: string, options: { onTrace?: (t: SearchTrace) => void }) => {
      options.onTrace?.({
        startedAt: 1_000,
        catalogSize: 65,
        model: fallback === "stage1_failed" ? null : "jev-test",
        shortlist: [],
        ranked: [],
        stage1Ms: 100,
        stage2Ms: null,
        totalMs: 100,
        fallback,
        errors: fallback === "stage1_failed" ? ["InternalServerError"] : [],
      });
      return [];
    });
  }

  function getSearchTool(search: jest.Mock): CopilotTool {
    const tool = createCopilotTools({ search }).find((t) => t.definition.name === "search_writing");
    if (!tool) throw new Error("search_writing is not registered");
    return tool;
  }

  it("returns an error, not the no-coverage note, when stage 1 failed and found nothing, and emits no source events", async () => {
    const emit = jest.fn();

    const result = await getSearchTool(emptySearchReporting("stage1_failed")).run(
      { query: "guardrails", more: false },
      { emit, signal }
    );

    expect(result).toEqual({ articles: [], error: "search unavailable" });
    expect(result).not.toHaveProperty("note");
    expect(emit).not.toHaveBeenCalled();
  });

  it("still returns the no-coverage note when the search ran and genuinely found nothing (fallback none)", async () => {
    const emit = jest.fn();

    const result = await getSearchTool(emptySearchReporting("none")).run(
      { query: "something I never wrote about", more: false },
      { emit, signal }
    );

    expect(result).toEqual({ articles: [], note: NOTE });
    expect(result).not.toHaveProperty("error");
    expect(emit).not.toHaveBeenCalled();
  });

  it("returns the exhausted note on more: true after a failed search, without searching again", async () => {
    const search = emptySearchReporting("stage1_failed");
    const tool = getSearchTool(search);
    const emit = jest.fn();

    const first = await tool.run({ query: "guardrails", more: false }, { emit, signal });
    const next = await tool.run({ query: "guardrails", more: true }, { emit, signal });

    expect(first).toEqual({ articles: [], error: "search unavailable" });
    expect(next).toEqual({ articles: [], note: MORE_NOTE });
    expect(next).not.toHaveProperty("error");
    expect(search).toHaveBeenCalledTimes(1);
    expect(emit).not.toHaveBeenCalled();
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

    await tool.run({ query: "guardrails", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

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

    await tool.run({ query: "guardrails", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

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

    await tool.run({ query: "q", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    const names = span.step.mock.calls.map((c) => c[0]);
    expect(names).toEqual(["jev filter (noul)"]);
  });

  it("puts the errors on the filter step when stage 1 failed", async () => {
    const { tool } = toolReporting(searchTrace({ fallback: "stage1_failed", errors: ["InternalServerError"], stage2Ms: null, ranked: [], shortlist: [] }), []);
    const span = fakeSpan();

    await tool.run({ query: "q", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.step.mock.calls[0][1]).toMatchObject({ error: "InternalServerError" });
    expect(span.step).toHaveBeenCalledTimes(1);
  });

  it("puts the errors on the rank step when stage 2 failed, and leaves the filter step clean", async () => {
    const { tool } = toolReporting(
      searchTrace({ fallback: "stage2_failed", errors: ["NoValidScores"] }),
      [found("a", null)]
    );
    const span = fakeSpan();

    await tool.run({ query: "q", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    const filter = span.step.mock.calls.find((c) => c[0] === "jev filter (noul)")![1];
    const rank = span.step.mock.calls.find((c) => c[0] === "jev rank (score)")![1];
    expect(filter.error).toBeUndefined();
    expect(rank.error).toBe("NoValidScores");
  });

  it("annotates the span with the fallback, timing, errors and the articles it chose", async () => {
    const { tool } = toolReporting(searchTrace({ errors: [] }), [found("a", 2.5), found("b", null)]);
    const span = fakeSpan();

    await tool.run({ query: "q", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

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

  it("keeps the Jev filter step with its error when stage 1 failed, and still returns the error result", async () => {
    const { tool } = toolReporting(
      searchTrace({ fallback: "stage1_failed", errors: ["InternalServerError"], stage2Ms: null, ranked: [], shortlist: [] }),
      []
    );
    const span = fakeSpan();

    const result = await tool.run({ query: "q", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(result).toEqual({ articles: [], error: "search unavailable" });
    expect(span.step).toHaveBeenCalledWith("jev filter (noul)", expect.objectContaining({ error: "InternalServerError" }));
    expect(span.step.mock.calls.map((c) => c[0])).toEqual(["jev filter (noul)"]);
  });

  it("records nothing when there is no trace span, and the tool output is unchanged", async () => {
    const withSpan = toolReporting(searchTrace());
    const without = toolReporting(searchTrace());
    const span = fakeSpan();

    const traced = await withSpan.tool.run({ query: "q", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });
    const untraced = await without.tool.run({ query: "q", more: false }, { emit: jest.fn(), signal });

    expect(untraced).toEqual(traced);
    expect(span.step).toHaveBeenCalled();
  });

  it("records nothing when the search never reports a trace", async () => {
    const { tool } = toolReporting(null);
    const span = fakeSpan();

    await tool.run({ query: "q", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.step).not.toHaveBeenCalled();
    expect(span.annotate).not.toHaveBeenCalled();
  });

  it("annotates a fresh search with only the page it served, and a more page as page \"more\" with its articles", async () => {
    const articles = [found("a", 2.5), found("b", 2.5), found("c", 2.5)];
    const search = jest.fn(async (_q: string, options: { onTrace?: (t: SearchTrace) => void }) => {
      options.onTrace?.(searchTrace());
      return articles;
    });
    const tool = createCopilotTools({ search }).find((t) => t.definition.name === "search_writing")!;
    const span = fakeSpan();

    await tool.run({ query: "q", more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.annotate.mock.calls[0][0].search.chosen.map((c: { slug: string }) => c.slug)).toEqual(["a", "b"]);
    const stepsAfterSearch = span.step.mock.calls.length;
    span.annotate.mockClear();

    await tool.run({ query: "q", more: true }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.annotate).toHaveBeenCalledWith({
      search: { page: "more", chosen: [{ slug: "c", relevance: 0.9, score: 2.5 }] },
    });
    expect(span.step).toHaveBeenCalledTimes(stepsAfterSearch);
    expect(search).toHaveBeenCalledTimes(1);
  });
});
