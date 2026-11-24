import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { Recording, ReplaySpan } from "./colophon-trace";
import { COLOPHON_TRACES_PATH, loadColophonTraces, titlesFor } from "./colophon-traces-load";

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
