import {
  MAX_PAGE_TARGETS,
  createCopilotTools,
  mergeByTopic,
  parseReadWritingArgs,
  parseSearchWritingArgs,
  parseShowOnPageTargets,
  type CopilotTool,
} from "./copilot-tools";
import type { Article } from "./articles";
import { MAX_ARTICLES_PER_REPLY } from "./search-config";
import { PAGE_TARGET_IDS } from "./profile";
import type { SearchTrace } from "./writing-search";
import type { TraceSpan } from "./copilot-loop";
import type { PriorCitation } from "./citation-ledger";

describe("parseShowOnPageTargets", () => {
  it("returns the single target as a one-item list", () => {
    expect(parseShowOnPageTargets('{"targets":["role-illumina"]}')).toEqual(["role-illumina"]);
  });

  it("accepts every anchor id the page exposes", () => {
    for (const id of PAGE_TARGET_IDS) {
      expect(parseShowOnPageTargets(JSON.stringify({ targets: [id] }))).toEqual([id]);
    }
  });

  it("keeps the targets in the order given, not sorted", () => {
    expect(parseShowOnPageTargets('{"targets":["tool-tigergraph","tool-neo4j","role-illumina"]}')).toEqual([
      "tool-tigergraph",
      "tool-neo4j",
      "role-illumina",
    ]);
  });

  it("removes repeated targets, keeping the first position", () => {
    expect(parseShowOnPageTargets('{"targets":["role-illumina","tool-neo4j","role-illumina"]}')).toEqual([
      "role-illumina",
      "tool-neo4j",
    ]);
  });

  it("drops unknown ids and keeps the valid ones in order", () => {
    expect(parseShowOnPageTargets('{"targets":["role-nasa","role-illumina","tool-neo4j","nope"]}')).toEqual([
      "role-illumina",
      "tool-neo4j",
    ]);
  });

  it("is case-sensitive and does not trim whitespace", () => {
    expect(parseShowOnPageTargets('{"targets":["ROLE-ILLUMINA"]}')).toBeNull();
    expect(parseShowOnPageTargets('{"targets":[" role-illumina"]}')).toBeNull();
  });

  it(`caps the list at MAX_PAGE_TARGETS (${MAX_PAGE_TARGETS}), keeping the first ones`, () => {
    const ids = PAGE_TARGET_IDS.slice(0, MAX_PAGE_TARGETS + 3);
    const out = parseShowOnPageTargets(JSON.stringify({ targets: ids }));
    expect(MAX_PAGE_TARGETS).toBe(6);
    expect(out).toEqual(ids.slice(0, MAX_PAGE_TARGETS));
  });

  it("counts the cap after dropping unknown and repeated ids", () => {
    const valid = PAGE_TARGET_IDS.slice(0, MAX_PAGE_TARGETS);
    const raw = JSON.stringify({ targets: ["bogus", valid[0], valid[0], ...valid.slice(1), "also-bogus"] });
    expect(parseShowOnPageTargets(raw)).toEqual(valid);
  });

  it("returns null for an empty string", () => {
    expect(parseShowOnPageTargets("")).toBeNull();
  });

  it("returns null for malformed JSON", () => {
    expect(parseShowOnPageTargets('{"targets":')).toBeNull();
    expect(parseShowOnPageTargets("not json")).toBeNull();
  });

  it.each([
    ["null", "null"],
    ["a bare string", '"role-illumina"'],
    ["a number", "42"],
    ["an array", '["role-illumina"]'],
  ])("returns null when the arguments parse to %s", (_label, raw) => {
    expect(parseShowOnPageTargets(raw)).toBeNull();
  });

  it("returns null when targets is missing", () => {
    expect(parseShowOnPageTargets("{}")).toBeNull();
  });

  it.each([
    ["a string", '{"targets":"role-illumina"}'],
    ["a number", '{"targets":5}'],
    ["null", '{"targets":null}'],
    ["an object", '{"targets":{"id":"role-illumina"}}'],
  ])("returns null when targets is not an array (%s)", (_label, raw) => {
    expect(parseShowOnPageTargets(raw)).toBeNull();
  });

  it.each([
    ["a number", '{"targets":[5]}'],
    ["null", '{"targets":[null]}'],
    ["an array", '{"targets":[["role-illumina"]]}'],
    ["an object", '{"targets":[{"id":"role-illumina"}]}'],
  ])("ignores non-string entries (%s) and returns null when nothing valid is left", (_label, raw) => {
    expect(parseShowOnPageTargets(raw)).toBeNull();
  });

  it("returns null when every target is unknown", () => {
    expect(parseShowOnPageTargets('{"targets":["role-nasa","tool-nope"]}')).toBeNull();
  });

  it("returns null for an empty list", () => {
    expect(parseShowOnPageTargets('{"targets":[]}')).toBeNull();
  });
});

describe("show_on_page tool run", () => {
  function getShowOnPage(): CopilotTool<string[]> {
    const tool = createCopilotTools().find((t) => t.definition.name === "show_on_page");
    if (!tool) throw new Error("show_on_page is not registered");
    return tool as CopilotTool<string[]>;
  }

  it("emits one action event per target, in order, and returns what was shown", async () => {
    const tool = getShowOnPage();
    const emit = jest.fn();
    const signal = new AbortController().signal;

    const result = await tool.run(["tool-tigergraph", "tool-neo4j", "role-illumina"], { emit, signal });

    expect(emit.mock.calls).toEqual([
      [{ type: "action", target: "tool-tigergraph" }],
      [{ type: "action", target: "tool-neo4j" }],
      [{ type: "action", target: "role-illumina" }],
    ]);
    expect(result).toEqual({ shown: ["tool-tigergraph", "tool-neo4j", "role-illumina"] });
  });
});

describe("createCopilotTools", () => {
  it("registers show_on_page (one call per reply), search_writing and read_writing (two each), in that order", () => {
    const tools = createCopilotTools();

    expect(tools.map((t) => t.definition.name)).toEqual(["show_on_page", "search_writing", "read_writing"]);
    expect(tools[0].maxCallsPerReply).toBe(1);
    expect(tools[1].maxCallsPerReply).toBe(2);
    expect(tools[2].maxCallsPerReply).toBe(2);
  });

  it("defines show_on_page as a strict function tool with a required array of the page anchor ids", () => {
    const { definition } = createCopilotTools()[0];

    expect(definition).toMatchObject({ type: "function", name: "show_on_page", strict: true });
    expect(definition.parameters).toMatchObject({
      type: "object",
      required: ["targets"],
      additionalProperties: false,
      properties: { targets: { type: "array", items: { type: "string" } } },
    });
    expect(
      (definition.parameters as { properties: { targets: { items: { enum: string[] } } } }).properties.targets.items.enum
    ).toEqual(PAGE_TARGET_IDS);
  });

  it("returns fresh tool instances on each call so per-reply state is not shared", () => {
    const first = createCopilotTools();
    const second = createCopilotTools();

    expect(first).not.toBe(second);
    expect(first[0]).not.toBe(second[0]);
  });

  it("wires the tool's parse to the same validation as parseShowOnPageTargets", () => {
    const tool = createCopilotTools()[0];

    expect(tool.parse('{"targets":["role-illumina","role-nasa"]}')).toEqual(["role-illumina"]);
    expect(tool.parse('{"targets":["role-nasa"]}')).toBeNull();
    expect(tool.parse("{")).toBeNull();
  });
});

describe("parseSearchWritingArgs", () => {
  it("returns the topics, trimmed, with more", () => {
    expect(parseSearchWritingArgs('{"topics":["  guardrails for agents  "],"more":false}')).toEqual({
      topics: ["guardrails for agents"],
      more: false,
    });
  });

  it("defaults more to false when it is missing", () => {
    expect(parseSearchWritingArgs('{"topics":["guardrails"]}')).toEqual({ topics: ["guardrails"], more: false });
  });

  it("keeps more: true", () => {
    expect(parseSearchWritingArgs('{"topics":["guardrails"],"more":true}')).toEqual({ topics: ["guardrails"], more: true });
  });

  it.each([
    ["a string", '{"topics":["guardrails"],"more":"yes"}'],
    ["a number", '{"topics":["guardrails"],"more":1}'],
  ])("returns null when more is not a boolean (%s)", (_label, raw) => {
    expect(parseSearchWritingArgs(raw)).toBeNull();
  });

  it("drops blank topics", () => {
    expect(parseSearchWritingArgs('{"topics":["  ","guardrails",""],"more":false}')?.topics).toEqual(["guardrails"]);
  });

  it("returns null when every topic is blank", () => {
    expect(parseSearchWritingArgs('{"topics":["", "   "],"more":false}')).toBeNull();
  });

  it("dedupes topics case-insensitively, keeping the first spelling", () => {
    expect(
      parseSearchWritingArgs('{"topics":["Guardrails","guardrails ","LangGraph","GUARDRAILS"],"more":false}')?.topics
    ).toEqual(["Guardrails", "LangGraph"]);
  });

  it("truncates each topic to 300 characters", () => {
    const topics = parseSearchWritingArgs(JSON.stringify({ topics: ["a".repeat(400)], more: false }))?.topics;
    expect(topics?.[0]).toHaveLength(300);
  });

  it("accepts three topics and rejects a fourth", () => {
    expect(parseSearchWritingArgs('{"topics":["a","b","c"],"more":false}')?.topics).toHaveLength(3);
    expect(parseSearchWritingArgs('{"topics":["a","b","c","d"],"more":false}')).toBeNull();
  });

  it("counts topics after dedupe, so a repeated fourth topic is still three", () => {
    expect(parseSearchWritingArgs('{"topics":["a","b","c","A"],"more":false}')?.topics).toEqual(["a", "b", "c"]);
  });

  it("returns null for zero topics", () => {
    expect(parseSearchWritingArgs('{"topics":[],"more":false}')).toBeNull();
  });

  it("returns null when topics is missing or not an array of strings", () => {
    expect(parseSearchWritingArgs("{}")).toBeNull();
    expect(parseSearchWritingArgs('{"topics":"guardrails","more":false}')).toBeNull();
    expect(parseSearchWritingArgs('{"topics":[42],"more":false}')).toBeNull();
    expect(parseSearchWritingArgs('{"topics":[null],"more":false}')).toBeNull();
  });

  it("no longer accepts the old single query field", () => {
    expect(parseSearchWritingArgs('{"query":"guardrails","more":false}')).toBeNull();
  });

  it("returns null for malformed JSON and for non-object JSON", () => {
    expect(parseSearchWritingArgs('{"topics":')).toBeNull();
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

  it("defines search_writing as a strict function tool taking required topics (1 to 3) and more", () => {
    const tool = getSearchTool(jest.fn());

    expect(tool.definition).toMatchObject({ type: "function", name: "search_writing", strict: true });
    expect(tool.definition.parameters).toMatchObject({
      type: "object",
      required: ["topics", "more"],
      additionalProperties: false,
      properties: {
        topics: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
        more: { type: "boolean" },
      },
    });
  });

  it("passes the query, the abort signal and a trace hook to the search", async () => {
    const search = jest.fn(async () => []);
    const emit = jest.fn();

    await getSearchTool(search).run({ topics: ["guardrails"], more: false }, { emit, signal });

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

    const first = await tool.run({ topics: ["first query"], more: false }, { emit, signal });
    const second = await tool.run({ topics: ["second query"], more: false }, { emit, signal });

    expect(first).toEqual({
      articles: [
        { n: 1, title: "Title a", url: "https://medium.com/@tituslhy/a", topic: "first query", outline: [], sections: [{ heading: null, text: "Body of a" }] },
        { n: 2, title: "Title b", url: "https://medium.com/@tituslhy/b", topic: "first query", outline: [], sections: [{ heading: null, text: "Body of b" }] },
      ],
      remaining: 0,
    });
    expect(second).toEqual({
      articles: [
        { n: 2, title: "Title b", url: "https://medium.com/@tituslhy/b", topic: "second query", outline: [], sections: [{ heading: null, text: "Body of b" }] },
        { n: 3, title: "Title c", url: "https://medium.com/@tituslhy/c", topic: "second query", outline: [], sections: [{ heading: null, text: "Body of c" }] },
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

    await tool.run({ topics: ["first"], more: false }, { emit, signal });
    await tool.run({ topics: ["second"], more: false }, { emit, signal });

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

    const result = (await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal })) as {
      articles: Array<Record<string, unknown>>;
    };

    expect(result.articles[0]).toMatchObject({ n: 1, coAuthors: ["Jane Doe"] });
    expect(result.articles[1]).not.toHaveProperty("coAuthors");
  });

  it("never puts coAuthors on a source event", async () => {
    const joint = { ...found("joint"), coAuthors: ["Jane Doe"] };
    const search = jest.fn().mockResolvedValueOnce([joint]);
    const emit = jest.fn();

    await getSearchTool(search).run({ topics: ["q"], more: false }, { emit, signal });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toHaveProperty("type", "source");
    expect(emit.mock.calls[0][0]).not.toHaveProperty("coAuthors");
  });

  it("returns an empty result with a note, and emits nothing, when no article covers the query", async () => {
    const tool = getSearchTool(jest.fn(async () => []));
    const emit = jest.fn();

    const result = await tool.run({ topics: ["something I never wrote about"], more: false }, { emit, signal });

    expect(result).toEqual({ articles: [], note: "No article of mine covers this." });
    expect(emit).not.toHaveBeenCalled();
  });

  it("rejects when the search itself throws, so the loop can report tool failed", async () => {
    const tool = getSearchTool(jest.fn(async () => Promise.reject(new Error("boom"))));

    await expect(tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal })).rejects.toThrow("boom");
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
      await getSearchTool(search).run({ topics: ["secret-query-marker"], more: false }, { emit: jest.fn(), signal });

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

    expect(await first.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal })).toMatchObject({ articles: [{ n: 1 }] });
    expect(await first.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal })).toMatchObject({ articles: [{ n: 1 }] });
    expect(await second.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal })).toMatchObject({ articles: [{ n: 1 }] });
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
  function out(slug: string, n: number, topic = "guardrails") {
    // A short fixture body is returned whole, with no headings and no outline.
    return {
      n,
      title: `Title ${slug}`,
      url: `https://medium.com/@tituslhy/${slug}`,
      topic,
      outline: [],
      sections: [{ heading: null, text: `Body of ${slug}` }],
    };
  }

  function getSearchTool(search: jest.Mock): CopilotTool {
    const tool = createCopilotTools({ search }).find((t) => t.definition.name === "search_writing");
    if (!tool) throw new Error("search_writing is not registered");
    return tool;
  }

  it("serves the first three articles of a new search, with the count still to come", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c"), found("d"), found("e")]);

    const result = await getSearchTool(search).run({ topics: ["guardrails"], more: false }, { emit: jest.fn(), signal });

    expect(result).toEqual({ articles: [out("a", 1), out("b", 2), out("c", 3)], remaining: 2 });
  });

  it("serves the next three on more: true from the stored ranking, without searching again", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c"), found("d"), found("e")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();

    await tool.run({ topics: ["guardrails"], more: false }, { emit, signal });
    const second = await tool.run({ topics: ["ignored on a follow-up"], more: true }, { emit, signal });

    expect(search).toHaveBeenCalledTimes(1);
    expect(second).toEqual({ articles: [out("d", 4), out("e", 5)], remaining: 0 });
  });

  it("returns the exhausted note once every stored article has been served", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();
    const next = { topics: ["guardrails"], more: true };

    expect(await tool.run({ topics: ["guardrails"], more: false }, { emit, signal })).toEqual({
      articles: [out("a", 1), out("b", 2), out("c", 3)],
      remaining: 0,
    });
    const exhausted = await tool.run(next, { emit, signal });

    expect(exhausted).toEqual({ articles: [], note: MORE_NOTE });
    expect(exhausted).not.toHaveProperty("remaining");
    expect(search).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledTimes(3);
  });

  it("runs a fresh search with the topic when more is true but no search has run yet", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c")]);

    const result = await getSearchTool(search).run({ topics: ["guardrails"], more: true }, { emit: jest.fn(), signal });

    expect(search).toHaveBeenCalledWith("guardrails", expect.objectContaining({ signal }));
    expect(result).toEqual({ articles: [out("a", 1), out("b", 2), out("c", 3)], remaining: 0 });
  });

  it("returns the exhausted note on more: true after a search that found nothing, without searching again", async () => {
    const search = jest.fn(async () => []);
    const tool = getSearchTool(search);

    await tool.run({ topics: ["something I never wrote about"], more: false }, { emit: jest.fn(), signal });
    const next = await tool.run({ topics: ["something I never wrote about"], more: true }, { emit: jest.fn(), signal });

    expect(next).toEqual({ articles: [], note: MORE_NOTE });
    expect(search).toHaveBeenCalledTimes(1);
  });

  it("continues numbering across pages and emits source events for the new page only", async () => {
    const search = jest.fn(async () => [found("a"), found("b"), found("c"), found("d")]);
    const tool = getSearchTool(search);
    const emit = jest.fn();

    await tool.run({ topics: ["q"], more: false }, { emit, signal });
    emit.mockClear();
    const second = await tool.run({ topics: ["q"], more: true }, { emit, signal });

    expect(second).toEqual({ articles: [out("d", 4, "q")], remaining: 0 });
    expect(emit.mock.calls.map((c) => c[0])).toEqual([
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

    await tool.run({ topics: ["first"], more: false }, { emit, signal });
    const second = await tool.run({ topics: ["second"], more: false }, { emit, signal });
    const next = await tool.run({ topics: ["second"], more: true }, { emit, signal });

    // a, b and c took numbers 1 to 3 in the first search, so x is the next free number.
    expect(second).toEqual({ articles: [out("x", 4, "second")], remaining: 0 });
    expect(next).toEqual({ articles: [], note: MORE_NOTE });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("parses the raw arguments with parseSearchWritingArgs, defaulting more to false", () => {
    const tool = getSearchTool(jest.fn());

    expect(tool.parse('{"topics":["guardrails"],"more":true}')).toEqual({ topics: ["guardrails"], more: true });
    expect(tool.parse('{"topics":["guardrails"]}')).toEqual({ topics: ["guardrails"], more: false });
    expect(tool.parse('{"topics":["guardrails"],"more":"yes"}')).toBeNull();
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
        nearMisses: [],
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
      { topics: ["guardrails"], more: false },
      { emit, signal }
    );

    expect(result).toEqual({ articles: [], error: "search unavailable" });
    expect(result).not.toHaveProperty("note");
    expect(emit).not.toHaveBeenCalled();
  });

  it("still returns the no-coverage note when the search ran and genuinely found nothing (fallback none)", async () => {
    const emit = jest.fn();

    const result = await getSearchTool(emptySearchReporting("none")).run(
      { topics: ["something I never wrote about"], more: false },
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

    const first = await tool.run({ topics: ["guardrails"], more: false }, { emit, signal });
    const next = await tool.run({ topics: ["guardrails"], more: true }, { emit, signal });

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
      nearMisses: [],
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
    publishedAt: "2025-06-18T00:00:00.000Z",
    body: `Body ${slug}`,
    outline: [],
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

    await tool.run({ topics: ["guardrails"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

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

    await tool.run({ topics: ["guardrails"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

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

    await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    const names = span.step.mock.calls.map((c) => c[0]);
    expect(names).toEqual(["jev filter (noul)"]);
  });

  it("puts the errors on the filter step when stage 1 failed", async () => {
    const { tool } = toolReporting(searchTrace({ fallback: "stage1_failed", errors: ["InternalServerError"], stage2Ms: null, ranked: [], shortlist: [] }), []);
    const span = fakeSpan();

    await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.step.mock.calls[0][1]).toMatchObject({ error: "InternalServerError" });
    expect(span.step).toHaveBeenCalledTimes(1);
  });

  it("puts the errors on the rank step when stage 2 failed, and leaves the filter step clean", async () => {
    const { tool } = toolReporting(
      searchTrace({ fallback: "stage2_failed", errors: ["NoValidScores"] }),
      [found("a", null)]
    );
    const span = fakeSpan();

    await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    const filter = span.step.mock.calls.find((c) => c[0] === "jev filter (noul)")![1];
    const rank = span.step.mock.calls.find((c) => c[0] === "jev rank (score)")![1];
    expect(filter.error).toBeUndefined();
    expect(rank.error).toBe("NoValidScores");
  });

  it("annotates the span with the fallback, timing, errors and the articles it chose", async () => {
    const { tool } = toolReporting(searchTrace({ errors: [] }), [found("a", 2.5), found("b", null)]);
    const span = fakeSpan();

    await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

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

    const result = await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(result).toEqual({ articles: [], error: "search unavailable" });
    expect(span.step).toHaveBeenCalledWith("jev filter (noul)", expect.objectContaining({ error: "InternalServerError" }));
    expect(span.step.mock.calls.map((c) => c[0])).toEqual(["jev filter (noul)"]);
  });

  it("records nothing when there is no trace span, and the tool output is unchanged", async () => {
    const withSpan = toolReporting(searchTrace());
    const without = toolReporting(searchTrace());
    const span = fakeSpan();

    const traced = await withSpan.tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });
    const untraced = await without.tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal });

    expect(untraced).toEqual(traced);
    expect(span.step).toHaveBeenCalled();
  });

  it("records nothing when the search never reports a trace", async () => {
    const { tool } = toolReporting(null);
    const span = fakeSpan();

    await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.step).not.toHaveBeenCalled();
    expect(span.annotate).not.toHaveBeenCalled();
  });

  it("annotates a fresh search with only the page it served, and a more page as page \"more\" with its articles", async () => {
    const articles = [found("a", 2.5), found("b", 2.5), found("c", 2.5), found("d", 2.5)];
    const search = jest.fn(async (_q: string, options: { onTrace?: (t: SearchTrace) => void }) => {
      options.onTrace?.(searchTrace());
      return articles;
    });
    const tool = createCopilotTools({ search }).find((t) => t.definition.name === "search_writing")!;
    const span = fakeSpan();

    await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.annotate.mock.calls[0][0].search.chosen.map((c: { slug: string }) => c.slug)).toEqual(["a", "b", "c"]);
    const stepsAfterSearch = span.step.mock.calls.length;
    span.annotate.mockClear();

    await tool.run({ topics: ["q"], more: true }, { emit: jest.fn(), signal, trace: span as unknown as TraceSpan });

    expect(span.annotate).toHaveBeenCalledWith({
      search: { page: "more", chosen: [{ slug: "d", relevance: 0.9, score: 2.5 }] },
    });
    expect(span.step).toHaveBeenCalledTimes(stepsAfterSearch);
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("search_writing citation ledger (prior citations)", () => {
  const signal = new AbortController().signal;
  const DATED = "2025-06-18T10:00:00.000Z";

  function found(slug: string, overrides: Record<string, unknown> = {}) {
    return {
      slug,
      title: `Title ${slug}`,
      url: `https://medium.com/@tituslhy/${slug}`,
      body: `Body of ${slug}`,
      relevance: 0.9,
      score: 2.5,
      publishedAt: DATED,
      ...overrides,
    };
  }

  /** An article cited in an earlier reply, as the server resolves it from the request. */
  function prior(n: number, slug: string): PriorCitation {
    return {
      n,
      slug,
      title: `Title ${slug}`,
      url: `https://medium.com/@tituslhy/${slug}`,
      publishedAt: DATED,
    };
  }

  function getSearchTool(search: jest.Mock, ledger: PriorCitation[]): CopilotTool {
    const tool = createCopilotTools({ search, prior: ledger }).find((t) => t.definition.name === "search_writing");
    if (!tool) throw new Error("search_writing is not registered");
    return tool;
  }

  it("keeps the number an article was cited under in an earlier reply", async () => {
    const search = jest.fn(async () => [found("x")]);
    const tool = getSearchTool(search, [prior(2, "x")]);

    const result = await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal });

    expect(result).toMatchObject({ articles: [{ n: 2, title: "Title x" }] });
  });

  it("gives a new article the number after the highest prior one, skipping gaps (2 and 5 give 6)", async () => {
    const search = jest.fn(async () => [found("z"), found("y")]);
    const tool = getSearchTool(search, [prior(2, "x"), prior(5, "y")]);

    const result = await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal });

    // z is new (6); y keeps the 5 it was cited under.
    expect(result).toMatchObject({ articles: [{ n: 6, title: "Title z" }, { n: 5, title: "Title y" }] });
  });

  it("starts at 1 when the ledger is empty", async () => {
    const search = jest.fn(async () => [found("a")]);
    const tool = getSearchTool(search, []);

    expect(await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal })).toMatchObject({
      articles: [{ n: 1 }],
    });
  });

  it("emits a source event for a prior-numbered article on its first appearance in this reply", async () => {
    const search = jest.fn(async () => [found("x")]);
    const tool = getSearchTool(search, [prior(2, "x")]);
    const emit = jest.fn();

    await tool.run({ topics: ["q"], more: false }, { emit, signal });

    expect(emit.mock.calls.map((c) => c[0])).toEqual([
      { type: "source", n: 2, title: "Title x", url: "https://medium.com/@tituslhy/x", relevance: 0.9, score: 2.5 },
    ]);
  });

  it("emits a prior-numbered article once per reply, however many times it is found in that reply", async () => {
    const search = jest.fn(async () => [found("x")]);
    const tool = getSearchTool(search, [prior(2, "x")]);
    const emit = jest.fn();

    await tool.run({ topics: ["first"], more: false }, { emit, signal });
    await tool.run({ topics: ["second"], more: false }, { emit, signal });

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit.mock.calls[0][0]).toMatchObject({ type: "source", n: 2 });
  });

  it("emits a prior-numbered article again in a new reply, since each reply needs its own footnotes", async () => {
    const search = jest.fn(async () => [found("x")]);
    const ledger = [prior(2, "x")];
    const replyOne = jest.fn();
    const replyTwo = jest.fn();

    await getSearchTool(search, ledger).run({ topics: ["q"], more: false }, { emit: replyOne, signal });
    const result = await getSearchTool(search, ledger).run({ topics: ["q"], more: false }, { emit: replyTwo, signal });

    expect(replyTwo).toHaveBeenCalledTimes(1);
    expect(replyTwo.mock.calls[0][0]).toMatchObject({ type: "source", n: 2 });
    expect(result).toMatchObject({ articles: [{ n: 2 }] });
  });

  it("emits the prior article and a new article in the same reply, each once", async () => {
    const search = jest.fn(async () => [found("x"), found("new")]);
    const tool = getSearchTool(search, [prior(2, "x")]);
    const emit = jest.fn();

    await tool.run({ topics: ["q"], more: false }, { emit, signal });

    expect(emit.mock.calls.map((c) => [c[0].n, c[0].title])).toEqual([
      [2, "Title x"],
      [3, "Title new"],
    ]);
  });

  it("keeps a prior number for an article found on a later page, and emits it on its first page", async () => {
    // PAGE_SIZE is 3: page one is [a, b, c], page two is [d].
    const search = jest.fn(async () => [found("a"), found("b"), found("c"), found("d")]);
    const tool = getSearchTool(search, [prior(4, "b")]);
    const emit = jest.fn();

    const first = await tool.run({ topics: ["q"], more: false }, { emit, signal });
    const second = await tool.run({ topics: ["q"], more: true }, { emit, signal });

    expect(first).toMatchObject({
      articles: [{ n: 5, title: "Title a" }, { n: 4, title: "Title b" }, { n: 6, title: "Title c" }],
      remaining: 1,
    });
    expect(second).toMatchObject({ articles: [{ n: 7, title: "Title d" }], remaining: 0 });
    expect(emit.mock.calls.map((c) => [c[0].n, c[0].title])).toEqual([
      [5, "Title a"],
      [4, "Title b"],
      [6, "Title c"],
      [7, "Title d"],
    ]);
  });

  it("puts the published date (YYYY-MM-DD) on each result", async () => {
    const search = jest.fn(async () => [found("x", { publishedAt: "2025-06-18T23:30:00.000Z" })]);
    const tool = getSearchTool(search, []);

    const result = await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal });

    expect(result).toEqual({
      articles: [
        {
          n: 1,
          title: "Title x",
          url: "https://medium.com/@tituslhy/x",
          published: "2025-06-18",
          topic: "q",
          outline: [],
          sections: [{ heading: null, text: "Body of x" }],
        },
      ],
      remaining: 0,
    });
  });

  it("omits published when the article has no publish date", async () => {
    const undated = {
      slug: "x",
      title: "Title x",
      url: "https://medium.com/@tituslhy/x",
      body: "Body of x",
      relevance: 0.9,
      score: 2.5,
    };
    const search = jest.fn(async () => [undated]);
    const tool = getSearchTool(search, []);

    const result = (await tool.run({ topics: ["q"], more: false }, { emit: jest.fn(), signal })) as {
      articles: Record<string, unknown>[];
    };

    expect(result.articles[0]).not.toHaveProperty("published");
    expect(result.articles[0]).toMatchObject({ n: 1, title: "Title x" });
  });
});

describe("search_writing sections", () => {
  const signal = new AbortController().signal;

  function article(slug: string) {
    return {
      slug,
      title: `Title ${slug}`,
      url: `https://medium.com/@tituslhy/${slug}`,
      body: `Body of ${slug}`,
      relevance: 0.9,
      score: 2.5,
      publishedAt: "2025-06-18T10:00:00.000Z",
      outline: [`Heading ${slug}`],
    };
  }

  function picked(slug: string) {
    return {
      outline: [`Heading ${slug}`],
      sections: [{ heading: `Heading ${slug}`, text: `Picked text of ${slug}` }],
      truncated: false,
    };
  }

  function toolWith(search: jest.Mock, pick: jest.Mock): CopilotTool {
    const tool = createCopilotTools({ search, pick }).find((t) => t.definition.name === "search_writing");
    if (!tool) throw new Error("search_writing is not registered");
    return tool;
  }

  it("search_writing output has sections and outline, not body", async () => {
    const search = jest.fn(async () => [article("a")]);
    const pick = jest.fn(async () => picked("a"));

    const result = await toolWith(search, pick).run({ topics: ["q"], more: false }, { emit: jest.fn(), signal });

    expect(result).toEqual({
      articles: [
        {
          n: 1,
          title: "Title a",
          url: "https://medium.com/@tituslhy/a",
          published: "2025-06-18",
          topic: "q",
          outline: ["Heading a"],
          sections: [{ heading: "Heading a", text: "Picked text of a" }],
        },
      ],
      remaining: 0,
    });
    expect((result as { articles: object[] }).articles[0]).not.toHaveProperty("body");
  });

  it("passes the query as the focus to pick", async () => {
    const search = jest.fn(async () => [article("a")]);
    const pick = jest.fn(async (_article: { slug: string; body: string }, _focus: string) => picked("a"));

    await toolWith(search, pick).run({ topics: ["guardrails for agents"], more: false }, { emit: jest.fn(), signal });

    expect(pick).toHaveBeenCalledTimes(1);
    expect(pick.mock.calls[0][0]).toMatchObject({ slug: "a", body: "Body of a" });
    expect(pick.mock.calls[0][1]).toBe("guardrails for agents");
  });

  it("records a jev sections trace step per served article", async () => {
    const search = jest.fn(async () => [article("a"), article("b")]);
    const pick = jest.fn(
      async (a: { slug: string }, _focus: string, opts?: { onTrace?: (t: unknown) => void }) => {
        opts?.onTrace?.({
          slug: a.slug,
          focus: "q",
          scored: [{ key: `Heading ${a.slug}`, score: 2.5 }],
          chosen: [`Heading ${a.slug}`],
          fallback: "none",
          startedAt: 1_000,
          ms: 40,
        });
        return picked(a.slug);
      }
    );
    const span = { annotate: jest.fn(), step: jest.fn(), end: jest.fn(), fail: jest.fn() };

    await toolWith(search, pick).run(
      { topics: ["q"], more: false },
      { emit: jest.fn(), signal, trace: span as unknown as TraceSpan }
    );

    expect(span.step).toHaveBeenCalledTimes(2);
    for (const slug of ["a", "b"]) {
      expect(span.step).toHaveBeenCalledWith(
        "jev sections (score)",
        expect.objectContaining({
          inputs: { focus: "q", slug },
          outputs: expect.objectContaining({ chosen: [`Heading ${slug}`], fallback: "none" }),
        })
      );
    }
  });
});

describe("search_writing short articles", () => {
  it("records no jev sections step for a short article returned whole", async () => {
    const signal = new AbortController().signal;
    const search = jest.fn(async () => [
      {
        slug: "short",
        title: "Title short",
        url: "https://medium.com/@tituslhy/short",
        body: "A short body.",
        outline: [],
        relevance: 0.9,
        score: 2.5,
        publishedAt: "2025-06-18T10:00:00.000Z",
      },
    ]);
    const tool = createCopilotTools({ search }).find((t) => t.definition.name === "search_writing") as CopilotTool;
    const span = { annotate: jest.fn(), step: jest.fn(), end: jest.fn(), fail: jest.fn() };

    const result = await tool.run(
      { topics: ["q"], more: false },
      { emit: jest.fn(), signal, trace: span as unknown as TraceSpan }
    );

    expect(result).toMatchObject({ articles: [{ n: 1, sections: [{ heading: null, text: "A short body." }] }] });
    expect(span.step).not.toHaveBeenCalledWith("jev sections (score)", expect.anything());
  });
});

// ---------------------------------------------------------------------------
// Task 4: one search per topic, merged round-robin, with per-topic failure rules.
// ---------------------------------------------------------------------------

describe("search_writing topics", () => {
  const signal = new AbortController().signal;

  function found(slug: string) {
    return {
      slug,
      title: `Title ${slug}`,
      url: `https://medium.com/@tituslhy/${slug}`,
      body: `Body of ${slug}`,
      relevance: 0.9,
      score: 2.5,
      publishedAt: "2025-06-18T10:00:00.000Z",
      outline: [],
    };
  }

  /** A search that answers each topic from `byTopic`, and reports `fallback` for it. */
  function searchByTopic(byTopic: Record<string, ReturnType<typeof found>[]>, fallback: SearchTrace["fallback"] = "none") {
    return jest.fn(async (query: string, options: { onTrace?: (t: SearchTrace) => void }) => {
      options.onTrace?.(trace(query, fallback));
      return byTopic[query] ?? [];
    });
  }

  function trace(query: string, fallback: SearchTrace["fallback"]): SearchTrace {
    return {
      startedAt: 1_000,
      catalogSize: 65,
      model: "jev-test",
      shortlist: [],
      ranked: [],
      stage1Ms: 10,
      stage2Ms: null,
      totalMs: 20,
      fallback,
      errors: fallback === "stage1_failed" ? ["TimeoutError"] : [],
      nearMisses: [],
      ...({ query } as object),
    } as SearchTrace;
  }

  function toolWith(search: jest.Mock, extra: { pick?: jest.Mock; prior?: PriorCitation[] } = {}): CopilotTool {
    const tool = createCopilotTools({ search, ...extra }).find((t) => t.definition.name === "search_writing");
    if (!tool) throw new Error("search_writing is not registered");
    return tool;
  }

  it("runs one search per topic in parallel", async () => {
    const started: string[] = [];
    const resolvers = new Map<string, (articles: ReturnType<typeof found>[]) => void>();
    const search = jest.fn((query: string) => {
      started.push(query);
      return new Promise<ReturnType<typeof found>[]>((resolve) => resolvers.set(query, resolve));
    });

    const run = toolWith(search).run({ topics: ["alpha", "beta", "gamma"], more: false }, { emit: jest.fn(), signal });
    await new Promise((resolve) => setTimeout(resolve, 0));

    // All three searches are in flight before any has resolved.
    expect(started).toEqual(["alpha", "beta", "gamma"]);
    expect(resolvers.size).toBe(3);

    resolvers.get("alpha")!([found("a1")]);
    resolvers.get("beta")!([found("b1")]);
    resolvers.get("gamma")!([found("c1")]);
    await run;
  });

  it("merges round-robin so each topic's best article is served first", async () => {
    const search = searchByTopic({
      alpha: [found("a1"), found("a2")],
      beta: [found("b1"), found("b2")],
      gamma: [found("c1")],
    });

    const first = await toolWith(search).run({ topics: ["alpha", "beta", "gamma"], more: false }, { emit: jest.fn(), signal });

    expect((first as { articles: { title: string }[] }).articles.map((a) => a.title)).toEqual([
      "Title a1",
      "Title b1",
      "Title c1",
    ]);
  });

  it("dedupes an article matched by two topics and lists both topics", async () => {
    const shared = found("x");
    const search = searchByTopic({ alpha: [shared, found("a1")], beta: [shared, found("b1")] });
    const span = { annotate: jest.fn(), step: jest.fn(), end: jest.fn(), fail: jest.fn() };

    const result = await toolWith(search).run(
      { topics: ["alpha", "beta"], more: false },
      { emit: jest.fn(), signal, trace: span as unknown as TraceSpan }
    );

    const articles = (result as { articles: { title: string; topic: string }[] }).articles;
    expect(articles.map((a) => a.title)).toEqual(["Title x", "Title a1", "Title b1"]);
    expect(articles[0].topic).toBe("alpha");
    expect(span.annotate).toHaveBeenCalledWith(
      expect.objectContaining({ search: expect.objectContaining({ topics: ["alpha", "beta"] }) })
    );
  });

  it("mergeByTopic lists every topic that matched an article, in first-match order", () => {
    const shared = found("x");
    const merged = mergeByTopic([
      { topic: "alpha", found: [shared, found("a1")] },
      { topic: "beta", found: [shared, found("b1")] },
    ]);

    expect(merged.map((a) => [a.slug, a.topics])).toEqual([
      ["x", ["alpha", "beta"]],
      ["a1", ["alpha"]],
      ["b1", ["beta"]],
    ]);
  });

  it("a topic with no results does not fail the call", async () => {
    const search = searchByTopic({ alpha: [found("a1")], beta: [] });

    const result = await toolWith(search).run({ topics: ["alpha", "beta"], more: false }, { emit: jest.fn(), signal });

    expect(result).toEqual({
      articles: [expect.objectContaining({ n: 1, title: "Title a1" })],
      remaining: 0,
    });
  });

  it("returns the no-coverage note when every topic came back empty", async () => {
    const search = searchByTopic({});

    const result = await toolWith(search).run({ topics: ["alpha", "beta"], more: false }, { emit: jest.fn(), signal });

    expect(search.mock.calls.map(([query]) => query)).toEqual(["alpha", "beta"]);
    expect(result).toEqual({ articles: [], note: "No article of mine covers this." });
  });

  it("returns the search-unavailable error when every topic's stage 1 failed", async () => {
    const search = searchByTopic({}, "stage1_failed");

    const result = await toolWith(search).run({ topics: ["alpha", "beta"], more: false }, { emit: jest.fn(), signal });

    expect(search.mock.calls.map(([query]) => query)).toEqual(["alpha", "beta"]);
    expect(result).toEqual({ articles: [], error: "search unavailable" });
  });

  it("returns the search-unavailable error when some topics failed and the rest were empty", async () => {
    const search = jest.fn(async (query: string, options: { onTrace?: (t: SearchTrace) => void }) => {
      options.onTrace?.(trace(query, query === "alpha" ? "stage1_failed" : "none"));
      return [];
    });

    const result = await toolWith(search).run({ topics: ["alpha", "beta"], more: false }, { emit: jest.fn(), signal });

    expect(result).toEqual({ articles: [], error: "search unavailable" });
  });

  it("serves three per page, and more: true continues the merged ranking without searching again", async () => {
    const search = searchByTopic({ alpha: [found("a1"), found("a2"), found("a3"), found("a4")], beta: [found("b1")] });
    const tool = toolWith(search);
    const emit = jest.fn();

    const first = await tool.run({ topics: ["alpha", "beta"], more: false }, { emit, signal });
    const second = await tool.run({ topics: ["ignored"], more: true }, { emit, signal });

    // Merged order: a1, b1, a2, a3, a4.
    expect((first as { articles: { title: string }[] }).articles.map((a) => a.title)).toEqual(["Title a1", "Title b1", "Title a2"]);
    expect(first).toMatchObject({ remaining: 2 });
    expect((second as { articles: { title: string }[] }).articles.map((a) => a.title)).toEqual(["Title a3", "Title a4"]);
    expect(second).toMatchObject({ remaining: 0 });
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("passes each article's own topic as the pick focus, and reports it on the article", async () => {
    const search = searchByTopic({ alpha: [found("a1")], beta: [found("b1")] });
    const pick = jest.fn(async (_article: { slug: string }, _focus: string) => ({
      outline: [],
      sections: [{ heading: null, text: "text" }],
      truncated: false,
    }));

    const result = await toolWith(search, { pick }).run(
      { topics: ["alpha", "beta"], more: false },
      { emit: jest.fn(), signal }
    );

    expect(pick.mock.calls.map(([article, focus]) => [article.slug, focus])).toEqual([
      ["a1", "alpha"],
      ["b1", "beta"],
    ]);
    expect((result as { articles: { topic: string }[] }).articles.map((a) => a.topic)).toEqual(["alpha", "beta"]);
  });

  it("keeps numbering seeded from the ledger across topics", async () => {
    const prior: PriorCitation = {
      n: 4,
      slug: "b",
      title: "Title b",
      url: "https://medium.com/@tituslhy/b",
      publishedAt: "2025-06-18T10:00:00.000Z",
    };
    const search = searchByTopic({ alpha: [found("b")], beta: [found("a1")] });

    const result = await toolWith(search, { prior: [prior] }).run(
      { topics: ["alpha", "beta"], more: false },
      { emit: jest.fn(), signal }
    );

    expect((result as { articles: { n: number; title: string }[] }).articles.map((a) => [a.n, a.title])).toEqual([
      [4, "Title b"],
      [5, "Title a1"],
    ]);
  });

  it("records a jev filter step per topic search, with that topic as its query and the near-misses on the step", async () => {
    const search = jest.fn(async (query: string, options: { onTrace?: (t: SearchTrace) => void }) => {
      options.onTrace?.({ ...trace(query, "none"), nearMisses: [{ slug: `near-${query}`, relevance: 0.4 }] });
      return [];
    });
    const span = { annotate: jest.fn(), step: jest.fn(), end: jest.fn(), fail: jest.fn() };

    await toolWith(search).run(
      { topics: ["alpha", "beta"], more: false },
      { emit: jest.fn(), signal, trace: span as unknown as TraceSpan }
    );

    for (const topic of ["alpha", "beta"]) {
      expect(span.step).toHaveBeenCalledWith(
        "jev filter (noul)",
        expect.objectContaining({
          inputs: expect.objectContaining({ query: topic }),
          outputs: expect.objectContaining({ nearMisses: [{ slug: `near-${topic}`, relevance: 0.4 }] }),
        })
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Task 6: read_writing reads named articles; shares numbering and the reply cap with search_writing.
// ---------------------------------------------------------------------------

function fixtureArticle(slug: string, id: string, overrides: Partial<Article> = {}): Article {
  return {
    slug,
    title: `Title ${slug}`,
    url: `https://medium.com/@tituslhy/${slug}-${id}`,
    publishedAt: "2025-06-18T10:00:00.000Z",
    summary: `Summary ${slug}`,
    keywords: ["keyword"],
    outline: ["Heading"],
    intro: `Intro ${slug}`,
    body: `Body of ${slug}`,
    words: 500,
    ...overrides,
  };
}

const ALPHA = fixtureArticle("alpha", "aaaaaaaaaaaa");
const BETA = fixtureArticle("beta", "bbbbbbbbbbbb");
const GAMMA = fixtureArticle("gamma", "cccccccccccc");
const DELTA = fixtureArticle("delta", "dddddddddddd");
const EPSILON = fixtureArticle("epsilon", "eeeeeeeeeeee");
const ZETA = fixtureArticle("zeta", "ffffffffffff");
const ETA = fixtureArticle("eta", "111111111111");
const THETA = fixtureArticle("theta", "222222222222");
const LIMIT_NOTE = "Reading limit for this reply reached; answer from what you have.";

/** A search_writing result for an article, as the search returns it. */
function foundOf(a: Article) {
  return {
    slug: a.slug,
    title: a.title,
    url: a.url,
    body: a.body,
    relevance: 0.9,
    score: 2.5,
    publishedAt: a.publishedAt,
    outline: a.outline,
  };
}

/** Every tool from ONE createCopilotTools() instance, so numbering and the reply cap are shared. */
function instance(deps: { search?: jest.Mock; pick?: jest.Mock; catalog?: Article[] } = {}) {
  const tools = createCopilotTools(deps);
  const byName = (name: string): CopilotTool => {
    const tool = tools.find((t) => t.definition.name === name);
    if (!tool) throw new Error(`${name} is not registered`);
    return tool;
  };
  return { searchWriting: byName("search_writing"), readWriting: byName("read_writing") };
}

function pickStub() {
  return jest.fn(async (article: { slug: string }, focus: string) => ({
    outline: [`O ${article.slug}`],
    sections: [{ heading: `H ${article.slug}`, text: `Picked ${article.slug} for ${focus}` }],
    truncated: false,
  }));
}

describe("read_writing", () => {
  const signal = new AbortController().signal;

  it("defines read_writing as a strict function tool taking 1 to 3 article ids and a focus, at most 2 calls a reply", () => {
    const tool = instance().readWriting;

    expect(tool.definition).toMatchObject({ type: "function", name: "read_writing", strict: true });
    expect(tool.definition.parameters).toMatchObject({
      type: "object",
      required: ["articles", "focus"],
      additionalProperties: false,
      properties: {
        articles: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
        focus: { type: "string" },
      },
    });
    expect(tool.maxCallsPerReply).toBe(2);
  });

  it("read_writing serves known ids with picked sections", async () => {
    const pick = pickStub();
    const { readWriting } = instance({ catalog: [ALPHA, BETA], pick });

    const result = await readWriting.run(
      { articles: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"], focus: "agents" },
      { emit: jest.fn(), signal }
    );

    expect(result).toEqual({
      articles: [
        {
          n: 1,
          title: "Title alpha",
          url: ALPHA.url,
          published: "2025-06-18",
          outline: ["O alpha"],
          sections: [{ heading: "H alpha", text: "Picked alpha for agents" }],
        },
        {
          n: 2,
          title: "Title beta",
          url: BETA.url,
          published: "2025-06-18",
          outline: ["O beta"],
          sections: [{ heading: "H beta", text: "Picked beta for agents" }],
        },
      ],
    });
    expect(result).not.toHaveProperty("errors");
    expect(pick.mock.calls.map(([article, focus]) => [article.slug, focus])).toEqual([
      ["alpha", "agents"],
      ["beta", "agents"],
    ]);
  });

  it("unknown ids get an error entry and no source event", async () => {
    const emit = jest.fn();
    const { readWriting } = instance({ catalog: [ALPHA], pick: pickStub() });

    const result = await readWriting.run({ articles: ["aaaaaaaaaaaa", "zzzzzzzzzzzz"], focus: "x" }, { emit, signal });

    expect(result).toEqual({
      articles: [expect.objectContaining({ n: 1, title: "Title alpha" })],
      errors: [{ id: "zzzzzzzzzzzz", error: "unknown article" }],
    });
    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      { type: "source", n: 1, title: "Title alpha", url: ALPHA.url, relevance: null, score: null },
    ]);
  });

  it("an article found by search_writing and then read keeps one number and one source event per reply", async () => {
    const emit = jest.fn();
    const search = jest.fn(async (query: string) => (query === "alpha topic" ? [foundOf(ALPHA)] : [foundOf(BETA)]));
    const { searchWriting, readWriting } = instance({ search, catalog: [ALPHA, BETA], pick: pickStub() });

    const found = await searchWriting.run({ topics: ["alpha topic"], more: false }, { emit, signal });
    const readBeta = await readWriting.run({ articles: ["bbbbbbbbbbbb"], focus: "f" }, { emit, signal });
    const foundBeta = await searchWriting.run({ topics: ["beta topic"], more: false }, { emit, signal });
    const readAlpha = await readWriting.run({ articles: ["aaaaaaaaaaaa"], focus: "f" }, { emit, signal });

    expect(found).toMatchObject({ articles: [{ n: 1, title: "Title alpha" }] });
    expect(readBeta).toMatchObject({ articles: [{ n: 2, title: "Title beta" }] });
    // Beta was already numbered 2 by read_writing, so search_writing keeps 2 and emits nothing new.
    expect(foundBeta).toMatchObject({ articles: [{ n: 2, title: "Title beta" }] });
    expect(readAlpha).toMatchObject({ articles: [{ n: 1, title: "Title alpha" }] });
    expect(emit.mock.calls.map(([event]) => event)).toEqual([
      { type: "source", n: 1, title: "Title alpha", url: ALPHA.url, relevance: 0.9, score: 2.5 },
      { type: "source", n: 2, title: "Title beta", url: BETA.url, relevance: null, score: null },
    ]);
  });

  it("stops at 6 articles per reply across both tools", async () => {
    expect(MAX_ARTICLES_PER_REPLY).toBe(6);
    const emit = jest.fn();
    const search = jest.fn(async () => [foundOf(EPSILON), foundOf(ZETA), foundOf(ETA), foundOf(THETA)]);
    const { searchWriting, readWriting } = instance({
      search,
      catalog: [ALPHA, BETA, GAMMA, DELTA, EPSILON, ZETA, ETA, THETA],
      pick: pickStub(),
    });

    // Four new articles from read_writing.
    const first = await readWriting.run({ articles: ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc", "dddddddddddd"], focus: "f" }, { emit, signal });
    expect(first).toMatchObject({ articles: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }] });

    // Two of the search's first page fit in the remaining capacity; the page is truncated.
    const second = await searchWriting.run({ topics: ["many"], more: false }, { emit, signal });
    expect((second as { articles: { title: string }[] }).articles.map((a) => a.title)).toEqual(["Title epsilon", "Title zeta"]);

    // Capacity is spent, so a new article gets the note.
    expect(await readWriting.run({ articles: ["222222222222"], focus: "f" }, { emit, signal })).toEqual({
      articles: [],
      note: LIMIT_NOTE,
    });
    expect(await searchWriting.run({ topics: ["many"], more: true }, { emit, signal })).toEqual({
      articles: [],
      note: LIMIT_NOTE,
    });

    // Re-serving an article already served this reply costs nothing and is still returned.
    const again = await readWriting.run({ articles: ["aaaaaaaaaaaa"], focus: "f" }, { emit, signal });
    expect(again).toMatchObject({ articles: [{ n: 1, title: "Title alpha" }] });
    expect(again).not.toHaveProperty("note");

    const sourceNumbers = emit.mock.calls.map(([event]) => event.n);
    expect(sourceNumbers).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe("parseReadWritingArgs", () => {
  it("rejects 0 or 4 ids", () => {
    expect(parseReadWritingArgs('{"articles":[],"focus":"agents"}')).toBeNull();
    expect(parseReadWritingArgs('{"articles":["a1","b2","c3","d4"],"focus":"agents"}')).toBeNull();
    expect(parseReadWritingArgs('{"articles":["aaaaaaaaaaaa","bbbbbbbbbbbb","cccccccccccc"],"focus":"agents"}')).toEqual({
      articles: ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc"],
      focus: "agents",
    });
  });

  it("trims and lowercases ids, drops blanks, and dedupes", () => {
    expect(
      parseReadWritingArgs('{"articles":[" AAAAAAAAAAAA ","","  ","aaaaaaaaaaaa","bbbbbbbbbbbb"],"focus":"f"}')
    ).toEqual({ articles: ["aaaaaaaaaaaa", "bbbbbbbbbbbb"], focus: "f" });
  });

  it("reduces a full Medium URL to its post id", () => {
    expect(
      parseReadWritingArgs('{"articles":["https://medium.com/@tituslhy/alpha-aaaaaaaaaaaa"],"focus":"f"}')
    ).toEqual({ articles: ["aaaaaaaaaaaa"], focus: "f" });
  });

  it("returns null for a blank or missing focus", () => {
    expect(parseReadWritingArgs('{"articles":["aaaaaaaaaaaa"],"focus":"   "}')).toBeNull();
    expect(parseReadWritingArgs('{"articles":["aaaaaaaaaaaa"]}')).toBeNull();
  });

  it("caps the focus at 300 characters", () => {
    expect(parseReadWritingArgs(JSON.stringify({ articles: ["aaaaaaaaaaaa"], focus: "x".repeat(400) }))?.focus).toHaveLength(300);
  });

  it("returns null for malformed JSON and for wrong types", () => {
    expect(parseReadWritingArgs('{"articles":["aaaaaaaaaaaa"],"focus":')).toBeNull();
    expect(parseReadWritingArgs('{"articles":"aaaaaaaaaaaa","focus":"f"}')).toBeNull();
    expect(parseReadWritingArgs('{"articles":[42],"focus":"f"}')).toBeNull();
    expect(parseReadWritingArgs('{"articles":["aaaaaaaaaaaa"],"focus":42}')).toBeNull();
    expect(parseReadWritingArgs("null")).toBeNull();
  });
});

describe("writing tools share one reply cap, under parallel calls and for unknown ids (review fixes)", () => {
  const signal = new AbortController().signal;

  it("the reply cap holds when both writing tools run in parallel", async () => {
    const emit = jest.fn();
    const search = jest.fn(async () => [foundOf(EPSILON), foundOf(ZETA), foundOf(ETA), foundOf(THETA)]);
    // read_writing admits its ids, then waits on pick; search_writing finishes first and admits its page in between.
    const slowPick = jest.fn(async (article: { slug: string }, focus: string) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { outline: [`O ${article.slug}`], sections: [{ heading: `H ${article.slug}`, text: `Picked ${article.slug} for ${focus}` }], truncated: false };
    });
    const { searchWriting, readWriting } = instance({ search, catalog: [ALPHA, BETA, GAMMA, DELTA], pick: slowPick });

    const [read, found] = await Promise.all([
      readWriting.run(
        { articles: ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc", "dddddddddddd"], focus: "f" },
        { emit, signal }
      ),
      searchWriting.run({ topics: ["many"], more: false }, { emit, signal }),
    ]);

    const served = [
      ...(read as { articles: { n: number }[] }).articles,
      ...(found as { articles: { n: number }[] }).articles,
    ];
    expect(served.length).toBeLessThanOrEqual(MAX_ARTICLES_PER_REPLY);
    const sources = emit.mock.calls.map(([event]) => event);
    expect(sources.length).toBeLessThanOrEqual(MAX_ARTICLES_PER_REPLY);
    expect(new Set(sources.map((e) => e.n)).size).toBe(sources.length);
  });

  it("read_writing at the cap still reports unknown ids", async () => {
    const emit = jest.fn();
    const search = jest.fn(async () => [foundOf(EPSILON), foundOf(ZETA), foundOf(ETA)]);
    const { searchWriting, readWriting } = instance({
      search,
      catalog: [ALPHA, BETA, GAMMA, DELTA],
      pick: pickStub(),
    });
    // Four read plus two from the search page (the page is cut to the two remaining) = the cap of six.
    await readWriting.run({ articles: ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc", "dddddddddddd"], focus: "f" }, { emit, signal });
    await searchWriting.run({ topics: ["many"], more: false }, { emit, signal });

    expect(await readWriting.run({ articles: ["unknownid0001"], focus: "f" }, { emit, signal })).toEqual({
      articles: [],
      note: LIMIT_NOTE,
      errors: [{ id: "unknownid0001", error: "unknown article" }],
    });
  });

  it("parseReadWritingArgs caps each id at 64 characters", () => {
    const parsed = parseReadWritingArgs(JSON.stringify({ articles: ["a".repeat(200)], focus: "f" }));

    expect(parsed).not.toBeNull();
    expect(parsed!.articles[0].length).toBeLessThanOrEqual(64);
  });
});
