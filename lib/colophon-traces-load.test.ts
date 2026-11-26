import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Recording, ReplaySpan } from "./colophon-trace";
import { COLOPHON_TRACES_PATH, loadColophonTraces, stepsFor, titlesFor } from "./colophon-traces-load";
import { ARTICLES } from "./articles";
import { mediumPostId } from "./citation-ledger";
import { quoteList, type CopilotTool } from "./copilot-tools";

let dir: string;
let counter = 0;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "colophon-traces-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Writes `body` (a string, or anything JSON-encoded) to a fresh file and returns its path. */
function fileWith(body: unknown): string {
  const path = join(dir, `traces-${counter++}.json`);
  writeFileSync(path, typeof body === "string" ? body : JSON.stringify(body));
  return path;
}

const root: ReplaySpan = { id: 0, parent: null, name: "copilot-chat", kind: "chain", start: 0, end: 3000, inputs: {}, outputs: {} };
const llm: ReplaySpan = { id: 1, parent: 0, name: "gpt round 1", kind: "llm", start: 0, end: 500, inputs: { question: "Q", tools: [] }, outputs: { calls: [], text: "" } };
const search: ReplaySpan = {
  id: 2,
  parent: 0,
  name: "search_writing",
  kind: "tool",
  start: 500,
  end: 2000,
  inputs: { topics: ["LangChain"] },
  outputs: { articles: [{ n: 1, title: "Agents", url: "https://x", published: "2025-01-01" }] },
};
const filter: ReplaySpan = {
  id: 3,
  parent: 2,
  name: "jev filter (noul)",
  kind: "jev",
  start: 600,
  end: 900,
  inputs: { query: "LangChain", articles: 2 },
  outputs: { model: "m", shortlist: [{ slug: "langgraph-agents", relevance: 0.9 }], nearMisses: [{ slug: "rag-basics", relevance: 0.2 }] },
};

function recording(over: Partial<Recording> = {}): Recording {
  return {
    id: "search",
    question: "Have you used LangChain?",
    recordedAt: "2026-11-24T08:00:00.000Z",
    models: { gpt: "gpt-6-luna", jev: "jev-1" },
    totalMs: 3000,
    spans: [root, llm, search, filter],
    answer: "Yes [1].",
    actions: [],
    sources: [{ n: 1, title: "Agents", url: "https://x" }],
    ...over,
  };
}

describe("COLOPHON_TRACES_PATH", () => {
  it("points at content/colophon-traces.json under the project root", () => {
    expect(COLOPHON_TRACES_PATH.endsWith(join("content", "colophon-traces.json"))).toBe(true);
  });
});

describe("loadColophonTraces: missing or malformed files", () => {
  it("returns null when the file is missing", () => {
    expect(loadColophonTraces(join(dir, "does-not-exist.json"))).toBeNull();
  });

  it("returns null when the file is not valid JSON", () => {
    expect(loadColophonTraces(fileWith("{ not json"))).toBeNull();
  });

  it("returns null when the top level is not an object with a recordings list", () => {
    expect(loadColophonTraces(fileWith([]))).toBeNull();
    expect(loadColophonTraces(fileWith("null"))).toBeNull();
    expect(loadColophonTraces(fileWith({}))).toBeNull();
    expect(loadColophonTraces(fileWith({ recordings: "search" }))).toBeNull();
  });

  it("returns null when no recording in the file is valid", () => {
    expect(loadColophonTraces(fileWith({ recordings: [] }))).toBeNull();
    expect(loadColophonTraces(fileWith({ recordings: [{ id: "search" }] }))).toBeNull();
  });
});

describe("loadColophonTraces: valid recordings", () => {
  it("returns a valid recording unchanged", () => {
    const r = recording();

    expect(loadColophonTraces(fileWith({ recordings: [r] }))).toEqual([r]);
  });

  it("orders the search recording before the broad one, whatever order the file has", () => {
    const broad = recording({ id: "broad", question: "How would you build production-ready agents?" });
    const search = recording();

    const out = loadColophonTraces(fileWith({ recordings: [broad, search] }));

    expect(out?.map((r) => r.id)).toEqual(["search", "broad"]);
  });

  it("accepts a recording whose actions and sources are empty lists", () => {
    expect(loadColophonTraces(fileWith({ recordings: [recording({ actions: [], sources: [] })] }))).toHaveLength(1);
  });
});

describe("loadColophonTraces: invalid recordings are filtered out", () => {
  const cases: [string, Partial<Recording> | ((r: Recording) => unknown)][] = [
    ["an unknown id", { id: "other" as Recording["id"] }],
    ["a missing question", { question: undefined as unknown as string }],
    ["a bad recordedAt date", { recordedAt: "yesterday" }],
    ["missing models", { models: undefined as unknown as Recording["models"] }],
    ["a negative totalMs", { totalMs: -1 }],
    ["a single span only", { spans: [root] }],
    ["a first span that has a parent", { spans: [{ ...root, parent: 4 }, llm] }],
    ["a span with an unknown kind", { spans: [root, { ...llm, kind: "db" as ReplaySpan["kind"] }] }],
    ["a span that ends before it starts", { spans: [root, { ...llm, start: 500, end: 100 }] }],
    ["a span with a negative start", { spans: [root, { ...llm, start: -5 }] }],
    ["a span with a non-integer id", { spans: [root, { ...llm, id: 1.5 }] }],
    ["a span whose inputs are a list", { spans: [root, { ...llm, inputs: [] as unknown as Record<string, unknown> }] }],
    ["an empty answer", { answer: "" }],
    ["an answer that is not a string", { answer: 3 as unknown as string }],
    ["an action that is not a string", { actions: [1 as unknown as string] }],
    ["a source with no url", { sources: [{ n: 1, title: "T" } as unknown as Recording["sources"][number]] }],
    ["a source with a non-integer n", { sources: [{ n: 1.5, title: "T", url: "u" }] }],
  ];

  it.each(cases)("drops a recording with %s", (_label, over) => {
    const bad = recording(over as Partial<Recording>);
    const good = recording({ id: "broad", question: "Broad?" });

    const out = loadColophonTraces(fileWith({ recordings: [bad, good] }));

    expect(out).toEqual([good]);
  });

  it("returns null when every recording is invalid", () => {
    expect(loadColophonTraces(fileWith({ recordings: [recording({ answer: "" }), recording({ totalMs: NaN as number })] }))).toBeNull();
  });
});

describe("titlesFor", () => {
  const articles = [
    { slug: "langgraph-agents", title: "Agents with LangGraph" },
    { slug: "rag-basics", title: "RAG basics" },
    { slug: "helm-charts", title: "Helm charts" },
    { slug: "unused", title: "Never mentioned" },
  ];

  it("returns no titles when there are no recordings", () => {
    expect(titlesFor([], articles)).toEqual({});
  });

  it("collects slugs from a jev span's inputs.slug, shortlist, nearMisses and ranked", () => {
    const r = recording({
      spans: [
        root,
        { ...filter, id: 1, parent: 0, inputs: { shortlist: [{ slug: "helm-charts" }] }, outputs: { nearMisses: [{ slug: "rag-basics", relevance: 0.1 }] } },
        { id: 2, parent: 0, name: "jev sections (score)", kind: "jev", start: 1, end: 2, inputs: { slug: "langgraph-agents" }, outputs: {} },
        { id: 3, parent: 0, name: "jev rank (score)", kind: "jev", start: 2, end: 3, inputs: {}, outputs: { ranked: [{ slug: "helm-charts", score: 3 }] } },
      ],
    });

    expect(titlesFor([r], articles)).toEqual({
      "langgraph-agents": "Agents with LangGraph",
      "rag-basics": "RAG basics",
      "helm-charts": "Helm charts",
    });
  });

  it("accepts bare slug strings in a shortlist as well as slug objects", () => {
    const r = recording({
      spans: [root, { ...filter, outputs: { shortlist: ["rag-basics", { slug: "helm-charts" }] } }],
    });

    expect(titlesFor([r], articles)).toEqual({ "rag-basics": "RAG basics", "helm-charts": "Helm charts" });
  });

  it("leaves out articles no recording mentions, and slugs the library does not have", () => {
    const r = recording({ spans: [root, { ...filter, outputs: { ranked: [{ slug: "ghost-article", score: 2 }] } }] });

    const out = titlesFor([r], articles);

    expect(out).toEqual({});
    expect(out).not.toHaveProperty("unused");
  });

  it("ignores non-string slugs and shortlists that are not lists", () => {
    const r = recording({
      spans: [root, { ...filter, inputs: { slug: 42 }, outputs: { shortlist: "rag-basics", nearMisses: [{ slug: 7 }, null] } }],
    });

    expect(titlesFor([r], articles)).toEqual({});
  });

  it("merges the slugs of every recording into one map", () => {
    const a = recording({ spans: [root, { ...filter, outputs: { ranked: [{ slug: "rag-basics", score: 1 }] } }] });
    const b = recording({ id: "broad", spans: [root, { ...filter, outputs: { ranked: [{ slug: "helm-charts", score: 1 }] } }] });

    expect(titlesFor([a, b], articles)).toEqual({ "rag-basics": "RAG basics", "helm-charts": "Helm charts" });
  });
});

describe("stepsFor", () => {
  const toolSpan = (over: Partial<ReplaySpan>): ReplaySpan => ({
    id: 10,
    parent: 0,
    name: "echo",
    kind: "tool",
    start: 100,
    end: 400,
    inputs: { topic: "alpha" },
    outputs: {},
    ...over,
  });

  /** A fake tool that reads one `topic` argument, labels itself with it, and records what it was parsed from. */
  const topicTool = (name: string, over: Partial<CopilotTool<string>> = {}): CopilotTool<string> => ({
    definition: { type: "function", name, description: name, strict: true, parameters: {} },
    maxCallsPerReply: 3,
    parse: jest.fn((raw: string) => {
      try {
        const o = JSON.parse(raw) as { topic?: unknown };
        return typeof o.topic === "string" ? o.topic : null;
      } catch {
        return null;
      }
    }),
    describe: (topic) => ({ doing: `Doing ${topic}`, done: `Did ${topic}` }),
    async run() {
      return {};
    },
    ...over,
  });

  it("gives one step per tool span with both labels, its id as a string, and its start and end", () => {
    const echo = topicTool("echo");
    const steps = stepsFor([recording({ spans: [root, toolSpan({ id: 10, start: 100, end: 400 })] })], [echo]);

    expect(steps.search).toEqual([{ id: "10", tool: "echo", doing: "Doing alpha", done: "Did alpha", start: 100, end: 400 }]);
  });

  it("sorts the steps by when they started, whatever order the spans are in", () => {
    const echo = topicTool("echo");
    const steps = stepsFor(
      [
        recording({
          spans: [
            root,
            toolSpan({ id: 3, start: 900, end: 950, inputs: { topic: "late" } }),
            toolSpan({ id: 2, start: 100, end: 200, inputs: { topic: "early" } }),
          ],
        }),
      ],
      [echo]
    );

    expect(steps.search.map((s) => s.doing)).toEqual(["Doing early", "Doing late"]);
  });

  it("parses each span's inputs with that tool's own parse, after JSON.stringify", () => {
    const echo = topicTool("echo");
    stepsFor([recording({ spans: [root, toolSpan({ inputs: { topic: "alpha", extra: 1 } })] })], [echo]);

    expect(echo.parse).toHaveBeenCalledWith('{"topic":"alpha","extra":1}');
  });

  it("gives a step for each recording, keyed by the recording's id, and an empty list when it made no tool calls", () => {
    const echo = topicTool("echo");
    const steps = stepsFor(
      [
        recording({ id: "search", spans: [root, toolSpan({ id: 5 })] }),
        recording({ id: "broad", spans: [root] }),
      ],
      [echo]
    );

    expect(Object.keys(steps).sort()).toEqual(["broad", "search"]);
    expect(steps.search).toHaveLength(1);
    expect(steps.broad).toEqual([]);
  });

  it("only takes spans of kind tool, even when another kind has a tool's name", () => {
    const echo = topicTool("echo");
    const steps = stepsFor(
      [recording({ spans: [root, toolSpan({ id: 7, kind: "llm", name: "echo" }), toolSpan({ id: 8 })] })],
      [echo]
    );

    expect(steps.search.map((s) => s.id)).toEqual(["8"]);
  });

  it("skips a span whose tool is not registered", () => {
    const echo = topicTool("echo");
    const steps = stepsFor([recording({ spans: [root, toolSpan({ id: 6, name: "retired_tool" }), toolSpan({ id: 8 })] })], [echo]);

    expect(steps.search.map((s) => s.tool)).toEqual(["echo"]);
  });

  it("skips a tool with no describe, as show_on_page has its own caption", () => {
    const quiet = topicTool("show", { describe: undefined });
    const steps = stepsFor([recording({ spans: [root, toolSpan({ id: 9, name: "show" })] })], [quiet]);

    expect(steps.search).toEqual([]);
  });

  it("skips a span whose inputs the tool cannot parse", () => {
    const echo = topicTool("echo");
    const steps = stepsFor([recording({ spans: [root, toolSpan({ id: 4, inputs: { topic: 42 } }), toolSpan({ id: 8 })] })], [echo]);

    expect(steps.search.map((s) => s.id)).toEqual(["8"]);
  });

  it("skips a span whose describe returns null, and keeps the others", () => {
    const echo = topicTool("echo", {
      describe: (topic) => (topic === "silent" ? null : { doing: `Doing ${topic}`, done: `Did ${topic}` }),
    });
    const steps = stepsFor(
      [recording({ spans: [root, toolSpan({ id: 4, inputs: { topic: "silent" } }), toolSpan({ id: 8, inputs: { topic: "loud" } })] })],
      [echo]
    );

    expect(steps.search.map((s) => s.doing)).toEqual(["Doing loud"]);
  });

  it("skips a span whose describe throws, and keeps the others", () => {
    const echo = topicTool("echo", {
      describe: (topic) => {
        if (topic === "broken") throw new Error("label broke");
        return { doing: `Doing ${topic}`, done: `Did ${topic}` };
      },
    });
    const steps = stepsFor(
      [recording({ spans: [root, toolSpan({ id: 4, inputs: { topic: "broken" } }), toolSpan({ id: 8, inputs: { topic: "fine" } })] })],
      [echo]
    );

    expect(steps.search.map((s) => s.doing)).toEqual(["Doing fine"]);
  });

  describe("against the recorded replies in content/colophon-traces.json", () => {
    const traces = loadColophonTraces(COLOPHON_TRACES_PATH);
    const byId = (id: string) => stepsFor(traces ?? [])[id];

    it("loads the two recordings", () => {
      expect(traces?.map((r) => r.id)).toEqual(["search", "broad"]);
    });

    it("gives the search reply one search_writing step for LangChain and LangGraph, from 6146 to 6989 ms", () => {
      const steps = byId("search");

      expect(steps).toEqual([
        {
          id: "2",
          tool: "search_writing",
          doing: "Searching my writing for “LangChain” and “LangGraph”",
          done: "Searched my writing for “LangChain” and “LangGraph”",
          start: 6146,
          end: 6989,
        },
      ]);
    });

    it("gives the broad reply three read_writing steps, each naming the real titles of the articles it read", () => {
      const steps = byId("broad");
      const titleOf = (id: string) => ARTICLES.find((a) => mediumPostId(a.url) === id)?.title;
      const broad = traces!.find((r) => r.id === "broad")!;
      const reads = broad.spans.filter((s) => s.name === "read_writing").sort((a, b) => a.start - b.start);

      expect(steps.map((s) => s.tool)).toEqual(["read_writing", "read_writing", "read_writing"]);
      expect(steps.map((s) => s.start)).toEqual(reads.map((s) => s.start));
      reads.forEach((span, i) => {
        const titles = (span.inputs.articles as string[]).map(titleOf).filter((t): t is string => Boolean(t));
        expect(titles.length).toBeGreaterThan(0);
        expect(steps[i].doing).toBe(`Reading ${quoteList(titles)}`);
        expect(steps[i].done).toBe(`Read ${quoteList(titles)}`);
      });
    });
  });
});
