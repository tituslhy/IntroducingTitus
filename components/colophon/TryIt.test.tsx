import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { Recording, ReplaySpan } from "@/lib/colophon-trace";
import type { StopTarget } from "@/lib/page-stops";
import { MIN_SCORE, RELEVANT } from "@/lib/search-config";
import TryIt, {
  ANSWER_SPEED,
  SPEED,
  axisFor,
  depthOf,
  diagramState,
  keysFor,
  measuredAt,
  recordedToWall,
  runningSpan,
  speedLabel,
  spanTab,
  spansByKey,
  storySteps,
  wallToRecorded,
  zoomWindow,
} from "./TryIt";


// react-markdown is mocked globally to plain text. The panel needs its links (citations),
// so this file renders `[text](href)` the way the real renderer would hand them to components.a.
jest.mock("react-markdown", () => {
  const React = jest.requireActual<typeof import("react")>("react");
  return {
    __esModule: true,
    default: ({ children, components }: { children: string; components?: Record<string, React.ElementType> }) => {
      const parts: React.ReactNode[] = [];
      const re = /\[([^\]]+)\]\(([^)]+)\)/g;
      let last = 0;
      let m: RegExpExecArray | null;
      let i = 0;
      while ((m = re.exec(children)) !== null) {
        parts.push(children.slice(last, m.index));
        const A = components?.a;
        parts.push(A ? React.createElement(A, { key: i++, href: m[2] }, m[1]) : m[1]);
        last = m.index + m[0].length;
      }
      parts.push(children.slice(last));
      return React.createElement("div", null, ...parts);
    },
  };
});

// ---------------------------------------------------------------------------
// Fixtures: a tool-question replay (6 s) and a broad-question replay (2.5 s).
// ---------------------------------------------------------------------------

const SRC_URL = "https://medium.com/@tituslhy/agents-langgraph";
const ROOT: ReplaySpan = { id: 0, parent: null, name: "copilot-chat", kind: "chain", start: 0, end: 6000, inputs: {}, outputs: {} };

const search: Recording = {
  id: "search",
  question: "Have you used LangChain and LangGraph?",
  recordedAt: "2026-11-24T08:00:00.000Z",
  models: { gpt: "gpt-6-luna", jev: "jev-1" },
  totalMs: 6000,
  spans: [
    ROOT,
    {
      id: 1,
      parent: 0,
      name: "gpt round 1",
      kind: "llm",
      start: 0,
      end: 900,
      inputs: { question: "Have you used LangChain and LangGraph?", tools: ["show_on_page", "search_writing", "read_writing"] },
      outputs: { calls: [{ name: "search_writing", arguments: { topics: ["LangChain", "LangGraph"], more: false } }], text: "" },
    },
    {
      id: 2,
      parent: 0,
      name: "search_writing",
      kind: "tool",
      start: 900,
      end: 3000,
      inputs: { topics: ["LangChain", "LangGraph"], more: false },
      outputs: { articles: [{ n: 1, title: "Agents with LangGraph", url: SRC_URL, published: "2025-03-01" }], remaining: 0 },
    },
    {
      id: 3,
      parent: 2,
      name: "jev filter (noul)",
      kind: "jev",
      start: 1000,
      end: 1800,
      inputs: { query: "LangGraph", articles: 65 },
      outputs: { model: "jev-1", shortlist: [{ slug: "langgraph-agents", relevance: 0.9 }], nearMisses: [{ slug: "rag-basics", relevance: 0.3 }] },
    },
    {
      id: 4,
      parent: 2,
      name: "jev rank (score)",
      kind: "jev",
      start: 1800,
      end: 2200,
      inputs: { query: "LangGraph", shortlist: [{ slug: "langgraph-agents", relevance: 0.9 }] },
      outputs: { ranked: [{ slug: "langgraph-agents", score: 3 }] },
    },
    {
      id: 5,
      parent: 2,
      name: "jev sections (score)",
      kind: "jev",
      start: 2200,
      end: 2900,
      inputs: { focus: "LangGraph", slug: "langgraph-agents" },
      outputs: {
        scored: [
          { key: "State", score: 3 },
          { key: "Tools", score: 1 },
          { key: "Intro", score: 0 },
        ],
        chosen: ["State"],
        fallback: "none",
      },
    },
    {
      id: 6,
      parent: 0,
      name: "gpt round 2",
      kind: "llm",
      start: 3000,
      end: 6000,
      inputs: { toolResults: 1, tools: ["show_on_page", "search_writing", "read_writing"] },
      outputs: { calls: [], text: "Yes. I used both LangChain and LangGraph, and wrote about LangGraph agents [1]." },
    },
  ],
  answer: "Yes. I used both LangChain and LangGraph, and wrote about LangGraph agents [1].",
  actions: ["role-illumina"],
  sources: [{ n: 1, title: "Agents with LangGraph", url: SRC_URL }],
};

const broad: Recording = {
  id: "broad",
  question: "How would you build production-ready agents?",
  recordedAt: "2026-11-24T08:00:00.000Z",
  models: { gpt: "gpt-6-luna", jev: "jev-1" },
  totalMs: 2500,
  spans: [
    { ...ROOT, end: 2500 },
    {
      id: 1,
      parent: 0,
      name: "gpt round 1",
      kind: "llm",
      start: 0,
      end: 400,
      inputs: { question: "How would you build production-ready agents?", tools: ["show_on_page", "read_writing"] },
      outputs: { calls: [{ name: "read_writing", arguments: { ids: ["langgraph-agents"] } }], text: "" },
    },
    {
      id: 2,
      parent: 0,
      name: "read_writing",
      kind: "tool",
      start: 400,
      end: 1400,
      inputs: { ids: ["langgraph-agents"] },
      outputs: { articles: [{ n: 1, title: "Agents with LangGraph", url: SRC_URL, published: "2025-03-01" }] },
    },
    {
      id: 3,
      parent: 2,
      name: "jev sections (score)",
      kind: "jev",
      start: 500,
      end: 1300,
      inputs: { focus: "production", slug: "langgraph-agents" },
      outputs: { scored: [{ key: "State", score: 3 }], chosen: ["State"], fallback: "none" },
    },
    {
      id: 4,
      parent: 0,
      name: "show_on_page",
      kind: "tool",
      start: 1400,
      end: 1500,
      inputs: { targets: ["role-illumina"] },
      outputs: { ok: true },
    },
    {
      id: 5,
      parent: 0,
      name: "gpt round 2",
      kind: "llm",
      start: 1500,
      end: 2500,
      inputs: { toolResults: 2, tools: [] },
      outputs: { calls: [], text: "Start with LangGraph [1]." },
    },
  ],
  answer: "Start with LangGraph [1].",
  actions: ["role-illumina"],
  sources: [{ n: 1, title: "Agents with LangGraph", url: SRC_URL }],
};

const titles = { "langgraph-agents": "Agents with LangGraph" };
const targets: StopTarget[] = [
  { id: "role-illumina", label: "Illumina, 2023", path: "/experience", page: "Experience" },
  { id: "stack", label: "Stack", path: "/about", page: "About", tool: true },
];

// ---------------------------------------------------------------------------
// Animation frames and the clock: driven by hand, so playback is deterministic.
// performance.now and requestAnimationFrame read one clock (wall ms since the test began).
// ---------------------------------------------------------------------------

let queue: { id: number; cb: FrameRequestCallback }[] = [];
let nextId = 1;
let clock = 0;
let rafSpy: jest.SpyInstance;
let cancelSpy: jest.SpyInstance;
let nowSpy: jest.SpyInstance;
const originalMatchMedia = window.matchMedia;

beforeEach(() => {
  queue = [];
  nextId = 1;
  clock = 0;
  rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation((cb: FrameRequestCallback) => {
    const id = nextId++;
    queue.push({ id, cb });
    return id;
  });
  cancelSpy = jest.spyOn(window, "cancelAnimationFrame").mockImplementation((id: number) => {
    queue = queue.filter((q) => q.id !== id);
  });
  nowSpy = jest.spyOn(performance, "now").mockImplementation(() => clock);
});

afterEach(() => {
  rafSpy.mockRestore();
  cancelSpy.mockRestore();
  nowSpy.mockRestore();
  window.matchMedia = originalMatchMedia;
});

/** Moves the clock to `ms` (wall time) and runs the frames queued so far. */
function frame(ms: number) {
  clock = ms;
  const pending = queue;
  queue = [];
  act(() => {
    pending.forEach(({ cb }) => cb(ms));
  });
}

/** The recorded ms where the answer starts streaming (the last GPT round). */
const cutOf = (r: Recording) => Math.max(0, ...r.spans.filter((s) => s.kind === "llm").map((s) => s.start));

/** Runs frames until the replay is at recorded time `recordedMs`, using the playback's own timing. */
function seekFrame(recordedMs: number, r: Recording = search) {
  frame(recordedToWall(recordedMs, cutOf(r)));
}

/** Presses the drawer's Watch button, then runs frames until the replay is at `recordedMs`. */
function playTo(recordedMs: number, r: Recording = search) {
  fireEvent.click(screen.getByRole("button", { name: "▶ Watch a real reply" }));
  seekFrame(recordedMs, r);
}

/** jsdom has no PointerEvent, so a plain event carries the pointer fields. */
function pointer(el: Element, type: "pointerdown" | "pointermove", init: { clientX: number; buttons?: number }) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(ev, { clientX: init.clientX, buttons: init.buttons ?? 1, pointerId: 1 });
  act(() => {
    el.dispatchEvent(ev);
  });
}

/** Gives an element a fixed width on screen, so pointer seeks have a track to measure. */
function giveWidth(el: Element, width: number) {
  (el as HTMLElement).getBoundingClientRect = () =>
    ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: 44, width, height: 44, toJSON: () => ({}) }) as DOMRect;
}

function renderTryIt(recordings: Recording[] = [search, broad]) {
  return render(<TryIt recordings={recordings} articleCount={65} titles={titles} targets={targets} />);
}

function mediaQuery(matches: boolean) {
  return {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(() => true),
  };
}

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

const span = (over: Partial<ReplaySpan>): ReplaySpan => ({
  id: 1,
  parent: 0,
  name: "gpt round 1",
  kind: "llm",
  start: 0,
  end: 100,
  inputs: {},
  outputs: {},
  ...over,
});

describe("SPEED", () => {
  it("replays at 1.5 times real time", () => {
    expect(SPEED).toBe(1.5);
  });
});

describe("speedLabel", () => {
  it("names one speed when the answer plays at the same speed as the rest", () => {
    expect(SPEED).toBe(ANSWER_SPEED);
    expect(speedLabel()).toBe(`replayed at ${SPEED}×`);
  });
});

describe("keysFor", () => {
  it("lights the record and the prompt on the first round, and the results on later rounds", () => {
    expect(keysFor(span({ name: "gpt round 1" }))).toEqual(["gpt", "record"]);
    expect(keysFor(span({ name: "gpt round 2" }))).toEqual(["gpt", "results"]);
  });

  it("lights the tools, the call and the tool itself for each tool", () => {
    expect(keysFor(span({ kind: "tool", name: "search_writing" }))).toEqual(["tools", "calls", "search"]);
    expect(keysFor(span({ kind: "tool", name: "read_writing" }))).toEqual(["tools", "calls", "read"]);
    expect(keysFor(span({ kind: "tool", name: "show_on_page" }))).toEqual(["tools", "calls", "show"]);
  });

  it("maps each Jev operation to its box, and rank also lights the merge", () => {
    expect(keysFor(span({ kind: "jev", name: "jev filter (noul)" }))).toEqual(["filter"]);
    expect(keysFor(span({ kind: "jev", name: "jev rank (score)" }))).toEqual(["rank", "merge"]);
    expect(keysFor(span({ kind: "jev", name: "jev sections (score)" }))).toEqual(["sections"]);
  });

  it("lights nothing for the root or an unknown tool", () => {
    expect(keysFor(span({ kind: "chain", name: "copilot-chat", parent: null }))).toEqual([]);
    expect(keysFor(span({ kind: "tool", name: "mystery" }))).toEqual([]);
  });
});

describe("diagramState", () => {
  it("is empty before the replay starts", () => {
    expect(diagramState(search.spans, 0, search.totalMs)).toEqual({});
  });

  it("marks the visitor and the guards done as soon as it starts, and lights the first round", () => {
    const s = diagramState(search.spans, 1, search.totalMs);

    expect(s).toMatchObject({ visitor: "done", guards: "done", gpt: "lit", record: "lit" });
    expect(s.tools).toBeUndefined();
  });

  it("finishes a span's keys once it has ended, and lights the next span's", () => {
    const s = diagramState(search.spans, 1000, search.totalMs);

    expect(s.gpt).toBe("done");
    expect(s.record).toBe("done");
    expect(s.tools).toBe("lit");
    expect(s.search).toBe("lit");
    expect(s.filter).toBe("lit");
    expect(s.sections).toBeUndefined();
  });

  it("lets a running key win over a finished one, when a later span shares it", () => {
    const s = diagramState(search.spans, 3500, search.totalMs);

    expect(s.gpt).toBe("lit");
    expect(s.results).toBe("lit");
    expect(s.record).toBe("done");
    expect(s.sections).toBe("done");
  });

  it("keeps a very short span lit for at least 150 ms", () => {
    const short: ReplaySpan[] = [ROOT, span({ id: 1, name: "jev filter (noul)", kind: "jev", start: 1000, end: 1010, parent: 0 })];

    expect(diagramState(short, 1100, 6000).filter).toBe("lit");
    expect(diagramState(short, 1200, 6000).filter).toBe("done");
  });

  it("at the end of the replay, finishes the answer, checks and drawer", () => {
    const s = diagramState(search.spans, search.totalMs, search.totalMs);

    expect(s).toMatchObject({ answer: "done", checks: "done", drawer: "done", gpt: "done" });
  });
});

describe("axisFor", () => {
  it("uses one-second gridlines for a short reply", () => {
    expect(axisFor(6000)).toEqual({ step: 1000, max: 6000 });
  });

  it("widens the step and rounds the axis up to whole steps", () => {
    expect(axisFor(9000)).toEqual({ step: 2000, max: 10000 });
    expect(axisFor(100000)).toEqual({ step: 20000, max: 100000 });
  });

  it("falls back to thirty-second steps for a long reply", () => {
    expect(axisFor(200000)).toEqual({ step: 30000, max: 210000 });
  });

  it("still gives a sane axis for an empty recording", () => {
    expect(axisFor(0)).toEqual({ step: 1000, max: 1000 });
  });
});

describe("zoomWindow", () => {
  it("is null when there is no tool or Jev work to magnify", () => {
    expect(zoomWindow([ROOT, span({ name: "gpt round 1" })])).toBeNull();
  });

  it("spans from the first tool or Jev start to the last end, padded by six percent", () => {
    // Work runs 900 → 3000 (2100 ms), so the pad is 126 ms.
    expect(zoomWindow(search.spans)).toEqual({ from: 774, to: 3126 });
  });

  it("never pads before zero, and keeps a minimum pad of 20 ms", () => {
    const z = zoomWindow([ROOT, span({ kind: "tool", name: "search_writing", parent: 0, start: 10, end: 50 })]);

    expect(z).toEqual({ from: 0, to: 70 });
  });

  it("gives a zero-length span one millisecond of width before padding", () => {
    const z = zoomWindow([ROOT, span({ kind: "jev", name: "jev rank (score)", parent: 0, start: 500, end: 500 })]);

    expect(z).toEqual({ from: 480, to: 521 });
  });
});

describe("depthOf", () => {
  it("is zero for the root, one for a child, and counts every ancestor", () => {
    expect(depthOf(search.spans[0], search.spans)).toBe(0);
    expect(depthOf(search.spans[1], search.spans)).toBe(1);
    expect(depthOf(search.spans[3], search.spans)).toBe(2);
  });
});

describe("runningSpan", () => {
  it("returns the span started most recently among those running", () => {
    expect(runningSpan(search.spans, 1000)?.name).toBe("jev filter (noul)");
    expect(runningSpan(search.spans, 2500)?.name).toBe("jev sections (score)");
  });

  it("is null once every span has finished", () => {
    expect(runningSpan(search.spans, 6000)).toBeNull();
  });

  it("ignores the root, even when nothing else is running", () => {
    expect(runningSpan([ROOT], 1)).toBeNull();
  });

  it("keeps a short span running for 150 ms after it starts", () => {
    const spans = [ROOT, span({ name: "jev rank (score)", kind: "jev", start: 500, end: 510 })];

    expect(runningSpan(spans, 600)?.name).toBe("jev rank (score)");
    expect(runningSpan(spans, 650)).toBeNull();
  });
});

describe("storySteps", () => {
  it("builds the tool-question story from the recording, in order, with the times it happens", () => {
    const steps = storySteps(search, 65);

    expect(steps.map((s) => s.at)).toEqual([0, 1, 900, 1000, 3000, 6000]);
    expect(steps[0].text).toMatch(/^Guards check the origin/);
    expect(steps[1].text).toBe("GPT reads the question with my record and the library map in its prompt.");
    expect(steps[2].text).toBe("It searches my writing for “LangChain” and “LangGraph”.");
    expect(steps[3].text).toBe(
      "Jev asks one yes-or-no question of all 65 articles per topic, scores the survivors 0–3, and keeps 1 of 3 sections across 1 article."
    );
    expect(steps[4].text).toBe("GPT writes the answer from my record and the article, citing it [1].");
    expect(steps[5].text).toBe("Checks rebuild the footnotes from my articles only; the reply offers places on the site to look.");
  });

  it("describes the broad route's read_writing and show_on_page calls, without any search", () => {
    const steps = storySteps(broad, 65);
    const text = steps.map((s) => s.text).join(" ");

    expect(text).toContain("opens 1 article it picked from the library map, and points at 1 place on this site.");
    expect(text).not.toContain("searches my writing");
    expect(text).toContain("Jev scores every section against each part and keeps 1 of 1 section across 1 article.");
  });

  it("says a multi-part question is split, one call per part", () => {
    const twoParts: Recording = {
      ...broad,
      spans: [
        ROOT,
        span({ id: 1, name: "gpt round 1", start: 0, end: 100 }),
        span({ id: 2, name: "read_writing", kind: "tool", parent: 0, start: 100, end: 300, outputs: { articles: [{ n: 1 }, { n: 2 }] } }),
        span({ id: 3, name: "read_writing", kind: "tool", parent: 0, start: 100, end: 300, outputs: { articles: [{ n: 3 }] } }),
      ],
      sources: [],
      actions: [],
    };

    const text = storySteps(twoParts, 65).map((s) => s.text).join(" ");
    expect(text).toContain("It splits the question into 2 parts and opens 3 articles from the library map, one call per part.");
  });

  it("drops the answer step for a single-round reply, and the sources and places clauses when there are none", () => {
    const single: Recording = { ...search, spans: [ROOT, search.spans[1]], sources: [], actions: [] };

    const steps = storySteps(single, 65);

    expect(steps.map((s) => s.text)).toEqual([
      expect.stringMatching(/^Guards/),
      "GPT reads the question with my record and the library map in its prompt.",
      "Checks rebuild the footnotes from my articles only.",
    ]);
  });

  it("reads a count of one as “1 article”, not “1 articles”", () => {
    const text = storySteps(broad, 65)
      .map((s) => s.text)
      .join(" ");

    expect(text).not.toMatch(/\b1 articles\b/);
  });
});
describe("ANSWER_SPEED", () => {
  it("is the same as SPEED, so the answer plays at the rest's speed", () => {
    expect(ANSWER_SPEED).toBe(SPEED);
  });
});

describe("wallToRecorded and recordedToWall", () => {
  const cut = 3000; // the last GPT round starts at 3 s of recorded time
  const cutWall = cut / SPEED; // which is reached after this much playback

  it("plays at SPEED before the cut, and at ANSWER_SPEED after it", () => {
    expect(wallToRecorded(500, cut)).toBeCloseTo(500 * SPEED, 9);
    expect(wallToRecorded(cutWall + 300, cut)).toBeCloseTo(cut + 300 * ANSWER_SPEED, 9);
    expect(recordedToWall(500 * SPEED, cut)).toBeCloseTo(500, 9);
    expect(recordedToWall(cut + 300 * ANSWER_SPEED, cut)).toBeCloseTo(cutWall + 300, 9);
  });

  it("is continuous at the cut: both sides meet at the cut", () => {
    expect(wallToRecorded(cutWall - 1e-6, cut)).toBeCloseTo(cut, 3);
    expect(wallToRecorded(cutWall + 1e-6, cut)).toBeCloseTo(cut, 3);
    expect(recordedToWall(cut - 1e-6, cut)).toBeCloseTo(cutWall, 3);
    expect(recordedToWall(cut + 1e-6, cut)).toBeCloseTo(cutWall, 3);
  });

  it("has a slope of SPEED before the cut and ANSWER_SPEED after it", () => {
    expect(wallToRecorded(cutWall - 100, cut) - wallToRecorded(cutWall - 200, cut)).toBeCloseTo(100 * SPEED, 9);
    expect(wallToRecorded(cutWall + 200, cut) - wallToRecorded(cutWall + 100, cut)).toBeCloseTo(100 * ANSWER_SPEED, 9);
  });

  it("is the exact inverse of the other, on both sides of the cut and at it", () => {
    const walls = [0, 1, 250, cutWall - 1, cutWall, cutWall + 1, 2500];
    const recs = [0, 1, 750, cut - 1, cut, cut + 1, 6000];
    for (const w of walls) expect(recordedToWall(wallToRecorded(w, cut), cut)).toBeCloseTo(w, 6);
    for (const t of recs) expect(wallToRecorded(recordedToWall(t, cut), cut)).toBeCloseTo(t, 6);
  });

  it("clamps negative wall time and negative recorded time to zero", () => {
    expect(wallToRecorded(-100, cut)).toBe(0);
    expect(recordedToWall(-50, cut)).toBe(0);
  });
});

describe("spansByKey", () => {
  it("groups the search route's spans under the box each one lights", () => {
    const m = spansByKey(search);

    expect(Object.keys(m).sort()).toEqual(["checks", "drawer", "filter", "gpt", "merge", "rank", "search", "sections"]);
    expect(m.gpt!.map((s) => s.id)).toEqual([1, 6]);
    expect(m.search!.map((s) => s.id)).toEqual([2]);
    expect(m.merge!.map((s) => s.id)).toEqual([2]);
    expect(m.filter!.map((s) => s.id)).toEqual([3]);
    expect(m.rank!.map((s) => s.id)).toEqual([4]);
    expect(m.sections!.map((s) => s.id)).toEqual([5]);
  });

  it("opens the root span on the checks and the drawer", () => {
    const m = spansByKey(search);

    expect(m.checks!.map((s) => s.id)).toEqual([0]);
    expect(m.drawer!.map((s) => s.id)).toEqual([0]);
  });

  it("omits the boxes with no spans: show and read on the search route", () => {
    const m = spansByKey(search);

    expect(m.show).toBeUndefined();
    expect(m.read).toBeUndefined();
  });

  it("groups the broad route's read_writing, show_on_page and sections", () => {
    const m = spansByKey(broad);

    expect(m.read!.map((s) => s.id)).toEqual([2]);
    expect(m.show!.map((s) => s.id)).toEqual([4]);
    expect(m.sections!.map((s) => s.id)).toEqual([3]);
    expect(m.search).toBeUndefined();
    expect(m.filter).toBeUndefined();
  });

  it("sorts each box's spans by start, whatever order the recording lists them in", () => {
    const rec: Recording = {
      ...search,
      spans: [ROOT, span({ id: 7, name: "gpt round 2", start: 3000, end: 6000 }), span({ id: 1, name: "gpt round 1", start: 0, end: 900 })],
    };

    expect(spansByKey(rec).gpt!.map((s) => s.id)).toEqual([1, 7]);
  });

  it("returns an empty map for a recording with no spans, and only checks and drawer for the root alone", () => {
    expect(spansByKey({ ...search, spans: [] })).toEqual({});
    expect(Object.keys(spansByKey({ ...search, spans: [ROOT] })).sort()).toEqual(["checks", "drawer"]);
  });
});

describe("measuredAt", () => {
  it("is empty before the replay starts", () => {
    expect(measuredAt(search, 0)).toEqual({});
  });

  it("says the guards passed as soon as it starts, and times the first round live", () => {
    expect(measuredAt(search, 500)).toEqual({ guards: "passed", gpt: "round 1 · 0.50s" });
  });

  it("keeps the round's duration once it has ended, and times the second round live while it runs", () => {
    expect(measuredAt(search, 1500).gpt).toBe("round 1 · 0.90s");
    expect(measuredAt(search, 4500).gpt).toBe("round 2 · 1.50s");
  });

  it("counts the rounds and sums their time at the end", () => {
    expect(measuredAt(search, 6000).gpt).toBe("2 rounds · 3.90s");
  });

  it("uses the singular for a single round", () => {
    const one: Recording = { ...search, spans: [ROOT, search.spans[1]] };

    expect(measuredAt(one, 6000).gpt).toBe("1 round · 0.90s");
  });

  it("reports what each Jev step kept once it has ended", () => {
    expect(measuredAt(search, 2000).filter).toBe("kept 1");
    expect(measuredAt(search, 2000).rank).toBeUndefined();
    expect(measuredAt(search, 2500).rank).toBe("kept 1");
    expect(measuredAt(search, 3000).sections).toBe("kept 1 of 3 sections");
  });

  it("says how many articles search_writing served once it has ended", () => {
    expect(measuredAt(search, 2900).merge).toBeUndefined();
    expect(measuredAt(search, 3000).merge).toBe("served 1");
  });

  it("counts the articles and calls of read_writing on the broad route", () => {
    expect(measuredAt(broad, 1200).read).toBeUndefined();
    expect(measuredAt(broad, 2000).read).toBe("1 article · 1 call");
    expect(measuredAt(broad, 2000).sections).toBe("kept 1 of 1 section");
  });

  it("names the sources and page stops at the end, and says passed or streamed when there are none", () => {
    expect(measuredAt(search, 6000)).toMatchObject({ checks: "1 source", drawer: "1 page stop" });
    expect(measuredAt(broad, 2500)).toMatchObject({ checks: "1 source", drawer: "1 page stop" });
    expect(measuredAt({ ...search, sources: [], actions: [] }, 6000)).toMatchObject({ checks: "passed", drawer: "streamed" });
  });

  it("gives no measure to a box that has not run yet", () => {
    const at500 = measuredAt(search, 500);

    expect(at500).not.toHaveProperty("filter");
    expect(at500).not.toHaveProperty("checks");
    expect(at500).not.toHaveProperty("drawer");
  });
});

describe("spanTab", () => {
  it("names a GPT round by its place in the list", () => {
    expect(spanTab(span({ name: "gpt round 3" }), 2)).toBe("round 3");
  });

  it("names a Jev filter by its query", () => {
    expect(spanTab(search.spans[3], 0)).toBe("LangGraph");
  });

  it("names a Jev sections call by its article, and a read_writing call by its part", () => {
    expect(spanTab(search.spans[5], 0)).toBe("article 1");
    expect(spanTab(broad.spans[3], 1)).toBe("article 2");
    expect(spanTab(broad.spans[2], 1)).toBe("part 2");
  });

  it("numbers any other call by its place in the list", () => {
    expect(spanTab(search.spans[2], 1)).toBe("2");
    expect(spanTab(broad.spans[4], 2)).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PLAY_LABEL = /^(▶ Play|▶ Resume|❚❚ Pause|↻ Replay)$/;
const playButton = () => screen.getByRole("button", { name: PLAY_LABEL });
const watchButton = () => screen.queryByRole("button", { name: "▶ Watch a real reply" });
const elapsed = () => screen.getByText(/^of /).querySelector("b")?.textContent;
const statValue = (label: string) => screen.getByText(label, { exact: true }).querySelector("b")?.textContent;
const caption = () => document.querySelector('p[aria-live="polite"]')?.textContent ?? "";
const drawer = () => screen.getByRole("complementary", { name: "The drawer" });
const slider = () => screen.getByRole("slider", { name: "Replay position" });
const dialogFor = (box: string) => screen.queryByRole("dialog", { name: `${box}: what went in and what came out` });
const pickBox = (label: string) => screen.getAllByRole("button", { name: label })[0];
const traceToggle = () => screen.getByRole("button", { name: /view as a trace|hide the trace/ });
const NEXT = "Next step ▸";
const BACK = "◂ Back";
const GPT_PICK = "GPT: open 2 recorded spans";
const SEARCH_PICK = "search_writing: open 1 recorded span";
const FILTER_PICK = "Jev filter: open 1 recorded span";
const RANK_PICK = "Jev rank: open 1 recorded span";
const SECTIONS_PICK = "Jev sections: open 1 recorded span";
const CHECKS_PICK = "checks: open 1 recorded span";

describe("TryIt idle state", () => {
  it("is one labelled region, with the recorded question as the pressed chip", () => {
    renderTryIt();

    expect(screen.getByRole("region", { name: "Try it: a recorded reply, replayed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: search.question, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: broad.question, pressed: false })).toBeInTheDocument();
  });

  it("offers Play and a Watch button in the drawer, with the length of the real work", () => {
    renderTryIt();

    expect(playButton()).toHaveTextContent("▶ Play");
    expect(watchButton()).toBeInTheDocument();
    expect(screen.getByText(/6\.00s of real work, replayed at 1\.5×\./)).toBeInTheDocument();
    expect(screen.getByText(/Any box in the diagram opens what went in and what came out, before or after you watch\./)).toBeInTheDocument();
  });

  it("shows the stats at zero, and the explore caption and empty drawer", () => {
    renderTryIt();

    expect(elapsed()).toBe("0.00s");
    expect(statValue("spans")).toBe("0 / 7");
    expect(statValue("model calls")).toBe("0");
    expect(caption()).toBe("Explore the diagram (any box opens what it did in this reply), or watch the reply move through it.");
    expect(within(drawer()).getByText(/The reply lands here, the way it did in the real drawer\./)).toBeInTheDocument();
  });

  it("draws a still stage before play, with no replay state, and its boxes already pickable", () => {
    const { container } = renderTryIt();

    expect(container.querySelectorAll("figure.reply-stage")).toHaveLength(1);
    expect(container.querySelectorAll("[data-state]")).toHaveLength(0);
    expect(container.querySelectorAll("[data-pick]").length).toBeGreaterThan(0);
  });

  it("keeps the waterfall behind a collapsed toggle", () => {
    renderTryIt();

    expect(traceToggle()).toHaveAttribute("aria-expanded", "false");
    expect(traceToggle()).toHaveAttribute("aria-controls", "colophon-trace");
    expect(screen.queryByRole("list", { name: "Spans in this reply" })).not.toBeInTheDocument();
  });

  it("shows the recording date in Singapore time, and one replay speed", () => {
    renderTryIt();

    expect(screen.getByText(/recorded 24 Nov 2026/)).toBeInTheDocument();
    expect(screen.getAllByText(/replayed at 1\.5×/)).toHaveLength(2); // the bar and the drawer
    expect(screen.queryByText(/the answer at/)).not.toBeInTheDocument();
  });
});

describe("TryIt playback", () => {
  it("follows the frames at three times real time before the answer", () => {
    renderTryIt();
    playTo(500 * 3);

    expect(elapsed()).toBe("1.50s");
    expect(screen.getByRole("button", { name: "❚❚ Pause" })).toBeInTheDocument();
  });

  it("slows to two times real time once the answer starts", () => {
    renderTryIt();
    playTo(3000); // the answer starts here: 1 s of playback
    seekFrame(4500); // 0.75 s of playback later: 1.5 s of recording

    expect(elapsed()).toBe("4.50s");
  });

  it("ends on Replay, with nothing left queued and every span seen", () => {
    renderTryIt();
    playTo(6000);

    expect(screen.getByRole("button", { name: "↻ Replay" })).toBeInTheDocument();
    expect(queue).toHaveLength(0);
    expect(statValue("spans")).toBe("7 / 7");
    expect(statValue("model calls")).toBe("5");
  });

  it("hides the Watch button in the drawer once the replay has started", () => {
    renderTryIt();
    fireEvent.click(screen.getByRole("button", { name: "▶ Watch a real reply" }));

    expect(watchButton()).not.toBeInTheDocument();
  });

  it("pauses on Pause, keeps the time, and resumes from it", () => {
    renderTryIt();
    playTo(1500);
    const pausedAt = clock;
    fireEvent.click(screen.getByRole("button", { name: "❚❚ Pause" }));

    expect(queue).toHaveLength(0);
    expect(screen.getByRole("button", { name: "▶ Resume" })).toBeInTheDocument();
    frame(pausedAt + 1000); // time passes while paused: nothing moves
    expect(elapsed()).toBe("1.50s");

    fireEvent.click(screen.getByRole("button", { name: "▶ Resume" }));
    expect(elapsed()).toBe("1.50s");
    frame(clock + 500); // 500 ms of playback from the resume point
    expect(elapsed()).toBe(`${((1500 + 500 * SPEED) / 1000).toFixed(2)}s`);
  });

  it("replays from the start after the end", () => {
    renderTryIt();
    playTo(6000);
    const endedAt = clock;

    fireEvent.click(screen.getByRole("button", { name: "↻ Replay" }));
    frame(endedAt + 500); // 500 ms of playback later

    expect(elapsed()).toBe(`${((500 * SPEED) / 1000).toFixed(2)}s`);
  });

  it("shows the answer only once its last round has started, and in full at the end", () => {
    renderTryIt();
    playTo(1500);

    expect(within(drawer()).queryByText(/wrote about LangGraph agents/)).not.toBeInTheDocument();
    seekFrame(6000);
    expect(within(drawer()).getByText(/wrote about LangGraph agents/)).toBeInTheDocument();
  });

  it("shows the question in the drawer once the reply starts, and writing dots until the answer streams", () => {
    renderTryIt();
    playTo(3000);

    expect(within(drawer()).getByText(search.question)).toBeInTheDocument();
    expect(drawer().querySelector('[aria-label="Writing"]')).not.toBeNull();

    seekFrame(4500);
    expect(drawer().querySelector('[aria-label="Writing"]')).toBeNull();
    expect(within(drawer()).getByText(/Yes\. I used both/)).toBeInTheDocument();
    expect(within(drawer()).queryByText(/wrote about LangGraph agents/)).not.toBeInTheDocument();
  });

  it("turns each citation into a superscript link to its source", () => {
    const { container } = renderTryIt();
    playTo(6000);

    const link = container.querySelector("sup a");
    expect(link).toHaveAttribute("href", SRC_URL);
    expect(link).toHaveAttribute("title", "Agents with LangGraph");
    expect(link).toHaveTextContent("1");
  });

  it("draws a comma before a citation that follows another, and none after text", () => {
    const SECOND_URL = "https://medium.com/@tituslhy/lora";
    const text = "Both say so [1][2]. Also see [2] and [1].";
    const adjacent: Recording = {
      ...search,
      answer: text,
      spans: search.spans.map((s) => (s.id === 6 ? { ...s, outputs: { ...s.outputs, text } } : s)),
      sources: [
        { n: 1, title: "Agents with LangGraph", url: SRC_URL },
        { n: 2, title: "Teaching Toothless to Bite", url: SECOND_URL },
      ],
    };
    const { container } = renderTryIt([adjacent]);
    playTo(6000, adjacent);

    const sups = [...container.querySelectorAll("sup")];
    expect(sups.map((sup) => sup.textContent)).toEqual(["1", ",2", "2", "1"]);
    expect(sups[1].querySelector("span")).toHaveTextContent(/^,$/);
    expect(sups[0].querySelector("span")).toBeNull();
    expect(sups[2].querySelector("span")).toBeNull();
    expect(sups[3].querySelector("span")).toBeNull();
  });

  it("shows the page stops once a show_on_page span has ended, and the sources only at the end", () => {
    renderTryIt([broad]);
    playTo(1200, broad);

    expect(within(drawer()).queryByText("showing you on the page:")).not.toBeInTheDocument();
    seekFrame(1600, broad);
    expect(within(drawer()).getByText("showing you on the page:")).toBeInTheDocument();
    expect(within(drawer()).getByRole("link", { name: /Illumina, 2023/ })).toHaveAttribute("href", "/experience#role-illumina");
    expect(screen.queryByRole("list", { name: "Sources" })).not.toBeInTheDocument();

    seekFrame(2500, broad);
    expect(screen.getByRole("list", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Agents with LangGraph/ })).toHaveAttribute("href", SRC_URL);
  });

  it("does not show page stops on the search route, whose recording has no show_on_page span", () => {
    renderTryIt();
    playTo(6000);

    expect(within(drawer()).queryByText("showing you on the page:")).not.toBeInTheDocument();
  });

  it("lights the diagram boxes as the replay runs", () => {
    const { container } = renderTryIt();
    playTo(500);

    container.querySelectorAll('g[data-k="gpt"]').forEach((g) => expect(g).toHaveAttribute("data-state", "lit"));
    expect(container.querySelector('g[data-k="record"]')).toHaveAttribute("data-state", "lit");
  });

  it("finishes the diagram when the replay ends", () => {
    const { container } = renderTryIt();
    playTo(6000);

    expect(container.querySelector('g[data-k="checks"]')).toHaveAttribute("data-state", "done");
    expect(container.querySelector('g[data-k="drawer"]')).toHaveAttribute("data-state", "done");
    container.querySelectorAll('g[data-k="gpt"]').forEach((g) => expect(g).toHaveAttribute("data-state", "done"));
    // "answer" is an arrow (GPT to checks), so it turns amber once it has run.
    expect(container.querySelector('path[data-k="answer"]')).toHaveAttribute("stroke", "var(--dg-measure, var(--amber))");
  });

  it("shows what each box measured in place of its explanation, once it has run", () => {
    renderTryIt();
    playTo(1500);

    expect(screen.getAllByText("round 1 · 0.90s")).toHaveLength(2);
    expect(screen.getAllByText("noul × 65")).toHaveLength(2); // the filter has not finished yet
  });

  it("shows the measures as the boxes finish, and the totals at the end", () => {
    const { container } = renderTryIt();
    playTo(3000);

    expect(screen.getAllByText("kept 1")).toHaveLength(4); // filter and rank
    expect(screen.getAllByText("kept 1 of 3 sections")).toHaveLength(2);
    expect(screen.getAllByText("served 1")).toHaveLength(2);
    expect(screen.getAllByText("round 2 · 0.00s")).toHaveLength(2);
    expect(screen.getAllByText("passed")).toHaveLength(2);

    seekFrame(6000);
    expect(screen.getAllByText("2 rounds · 3.90s")).toHaveLength(2);
    expect(screen.getAllByText("1 source")).toHaveLength(2);
    expect(screen.getAllByText("1 page stop")).toHaveLength(2);
    expect(container.querySelectorAll("text[data-measured]").length).toBeGreaterThan(0);
  });

  it("names the step under way in the caption, and keeps it in step with the time", () => {
    renderTryIt();
    playTo(1500);

    expect(caption()).toBe(storySteps(search, 65)[3].text);
  });

  it("stops at the end, asking no further frames", () => {
    renderTryIt();
    playTo(6000);

    expect(queue).toHaveLength(0);
    expect(screen.getByRole("button", { name: "↻ Replay" })).not.toBeDisabled();
  });

  it("uses the animation frame when matchMedia is missing from the browser", () => {
    (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
    renderTryIt();
    fireEvent.click(screen.getByRole("button", { name: "▶ Watch a real reply" }));

    expect(queue).toHaveLength(1);
  });
});

describe("TryIt timeline", () => {
  it("reports its position to assistive technology", () => {
    renderTryIt();
    playTo(3000);

    expect(slider()).toHaveAttribute("aria-valuemin", "0");
    expect(slider()).toHaveAttribute("aria-valuemax", "6000");
    expect(slider()).toHaveAttribute("aria-valuenow", "3000");
    expect(slider()).toHaveAttribute("aria-valuetext", "3.00s of 6.00s");
  });

  it("steps 500 ms with the arrow keys, and jumps to the ends with Home and End", () => {
    renderTryIt();

    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(slider()).toHaveAttribute("aria-valuenow", "500");
    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(slider()).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(slider(), { key: "End" });
    expect(slider()).toHaveAttribute("aria-valuenow", "6000");
    fireEvent.keyDown(slider(), { key: "Home" });
    expect(slider()).toHaveAttribute("aria-valuenow", "0");
  });

  it("stops at either end, and ignores other keys", () => {
    renderTryIt();

    fireEvent.keyDown(slider(), { key: "ArrowLeft" });
    expect(slider()).toHaveAttribute("aria-valuenow", "0");
    fireEvent.keyDown(slider(), { key: "End" });
    fireEvent.keyDown(slider(), { key: "ArrowRight" });
    expect(slider()).toHaveAttribute("aria-valuenow", "6000");
    fireEvent.keyDown(slider(), { key: "a" });
    expect(slider()).toHaveAttribute("aria-valuenow", "6000");
  });

  it("seeks with a pointer, and while the button is held", () => {
    renderTryIt();
    giveWidth(slider(), 600);

    pointer(slider(), "pointerdown", { clientX: 150 });
    expect(slider()).toHaveAttribute("aria-valuenow", "1500");
    pointer(slider(), "pointermove", { clientX: 300, buttons: 1 });
    expect(slider()).toHaveAttribute("aria-valuenow", "3000");
    pointer(slider(), "pointermove", { clientX: 60, buttons: 0 });
    expect(slider()).toHaveAttribute("aria-valuenow", "3000");
  });

  it("pauses a playing replay when it is seeked", () => {
    renderTryIt();
    playTo(1500);

    fireEvent.keyDown(slider(), { key: "End" });

    expect(screen.getByRole("button", { name: "↻ Replay" })).toBeInTheDocument();
    expect(queue).toHaveLength(0);
  });
});

describe("TryIt boxes open their recorded spans", () => {
  it("makes the boxes with spans clickable from the start, and shows show_on_page only where the recording has it", () => {
    renderTryIt();
    expect(screen.getAllByRole("button", { name: GPT_PICK })).toHaveLength(2);
    expect(screen.queryAllByRole("button", { name: /^show_on_page/ })).toHaveLength(0);

    playTo(500);
    expect(screen.getAllByRole("button", { name: GPT_PICK })).toHaveLength(2);
  });

  it("opens an inspector before play, from the box's recorded spans", () => {
    renderTryIt();
    fireEvent.click(pickBox(CHECKS_PICK));

    expect(screen.getByRole("dialog", { name: "checks: what went in and what came out" })).toBeInTheDocument();
  });

  it("offers show_on_page on the broad route, which has one", () => {
    renderTryIt([broad]);
    playTo(500, broad);

    expect(screen.getAllByRole("button", { name: "show_on_page: open 1 recorded span" })).toHaveLength(2); // the tool row, in each SVG
  });

  it("opens an inspector beside a box, with what went in and what came out", () => {
    renderTryIt();
    playTo(3000);
    fireEvent.click(pickBox(SEARCH_PICK));

    const dlg = screen.getByRole("dialog", { name: "search_writing: what went in and what came out" });
    expect(within(dlg).getByText('["LangChain","LangGraph"]')).toBeInTheDocument();
    expect(within(dlg).getByText("[1] Agents with LangGraph")).toBeInTheDocument();
    expect(within(dlg).getByText("0 more ranked behind these")).toBeInTheDocument();
    expect(pickBox(SEARCH_PICK)).toHaveAttribute("aria-pressed", "true");
    expect(within(dlg).queryByRole("tablist")).not.toBeInTheDocument();
  });

  it("shows how many sections Jev kept, of how many, for the article it read", () => {
    renderTryIt();
    playTo(3000);
    fireEvent.click(pickBox(SECTIONS_PICK));

    const dlg = screen.getByRole("dialog", { name: "Jev sections: what went in and what came out" });
    expect(within(dlg).getByText("1 of 3 sections")).toBeInTheDocument();
    expect(within(dlg).getByText("Agents with LangGraph")).toBeInTheDocument();
  });

  it("shows the jev filter's shortlist and near misses by title", () => {
    renderTryIt();
    playTo(2000);
    fireEvent.click(pickBox(FILTER_PICK));

    const dlg = screen.getByRole("dialog", { name: "Jev filter: what went in and what came out" });
    expect(within(dlg).getByText(`1 with p(yes) ≥ ${RELEVANT}`)).toBeInTheDocument();
    expect(within(dlg).getByText("rag-basics")).toBeInTheDocument();
  });

  it("colours a rank bar at MIN_SCORE and fades one just below it", () => {
    const rank: Recording = {
      ...search,
      spans: search.spans.map((s) =>
        s.name === "jev rank (score)"
          ? { ...s, outputs: { ranked: [{ slug: "langgraph-agents", score: MIN_SCORE }, { slug: "rag-basics", score: MIN_SCORE - 0.1 }] } }
          : s
      ),
    };
    renderTryIt([rank]);
    playTo(2500);
    fireEvent.click(pickBox(RANK_PICK));

    const dlg = screen.getByRole("dialog", { name: "Jev rank: what went in and what came out" });
    expect(within(dlg).getByText("Agents with LangGraph").className).toContain("text-[var(--scr-text)]");
    expect(within(dlg).getByText("rag-basics").className).toContain("text-[var(--scr-dim)]");
  });

  it("opens a GPT round with a tab per round, and notes that the system prompt is not recorded", () => {
    renderTryIt();
    playTo(500);
    fireEvent.click(pickBox(GPT_PICK));

    const dlg = screen.getByRole("dialog", { name: "GPT: what went in and what came out" });
    expect(within(dlg).getByText(`“${search.question}” + my record and library map`)).toBeInTheDocument();
    expect(within(dlg).getByText("gpt-6-luna")).toBeInTheDocument();
    expect(within(dlg).getByText(/search_writing\(\{"topics":\["LangChain","LangGraph"\],"more":false\}\)/)).toBeInTheDocument();
    expect(within(dlg).getByText("The system prompt isn’t recorded, so it isn’t shown.")).toBeInTheDocument();
    expect(within(dlg).getByRole("tab", { name: "round 1", selected: true })).toBeInTheDocument();
  });

  it("switches between a box's rounds, and shows a running round's output as streaming", () => {
    renderTryIt();
    playTo(1500);
    fireEvent.click(pickBox(GPT_PICK));

    fireEvent.click(screen.getByRole("tab", { name: "round 2" }));
    const dlg = screen.getByRole("dialog", { name: "GPT: what went in and what came out" });
    expect(within(dlg).getByText("1 tool results")).toBeInTheDocument();
    expect(within(dlg).getByText("streaming…")).toBeInTheDocument();
  });

  it("opens the root span on the checks box once the replay has ended", () => {
    renderTryIt();
    playTo(6000);
    fireEvent.click(pickBox(CHECKS_PICK));

    const dlg = screen.getByRole("dialog", { name: "checks: what went in and what came out" });
    expect(within(dlg).getByText("answer · 1 sources · 1 page stops")).toBeInTheDocument();
    expect(within(dlg).queryByText(/system prompt/)).not.toBeInTheDocument();
  });

  it("closes with the Close button", () => {
    renderTryIt();
    playTo(500);
    fireEvent.click(pickBox(GPT_PICK));

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(dialogFor("GPT")).not.toBeInTheDocument();
  });

  it("closes with Escape, and with a press outside the inspector and its boxes", () => {
    renderTryIt();
    playTo(500);

    fireEvent.click(pickBox(GPT_PICK));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialogFor("GPT")).not.toBeInTheDocument();

    fireEvent.click(pickBox(GPT_PICK));
    pointer(screen.getByRole("dialog", { name: "GPT: what went in and what came out" }), "pointerdown", { clientX: 0 });
    expect(dialogFor("GPT")).toBeInTheDocument();

    pointer(document.body, "pointerdown", { clientX: 0 });
    expect(dialogFor("GPT")).not.toBeInTheDocument();
  });

  it("closes when the same box is pressed again, and moves when another box is pressed", () => {
    renderTryIt();
    playTo(3000);

    fireEvent.click(pickBox(GPT_PICK));
    expect(dialogFor("GPT")).toBeInTheDocument();
    expect(screen.getByText("The system prompt isn’t recorded, so it isn’t shown.")).toBeInTheDocument();

    fireEvent.click(pickBox(GPT_PICK));
    expect(dialogFor("GPT")).not.toBeInTheDocument();

    fireEvent.click(pickBox(GPT_PICK));
    fireEvent.click(pickBox(SECTIONS_PICK));
    expect(dialogFor("GPT")).not.toBeInTheDocument();
    expect(dialogFor("Jev sections")).toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
  });

  it("opens on Enter and closes on Space from the keyboard", () => {
    renderTryIt();
    playTo(500);
    const gpt = pickBox(GPT_PICK);

    fireEvent.keyDown(gpt, { key: "a" });
    expect(dialogFor("GPT")).not.toBeInTheDocument();
    fireEvent.keyDown(gpt, { key: "Enter" });
    expect(dialogFor("GPT")).toBeInTheDocument();
    fireEvent.keyDown(gpt, { key: " " });
    expect(dialogFor("GPT")).not.toBeInTheDocument();
  });

  it("closes when the recording is switched", () => {
    renderTryIt();
    playTo(500);
    fireEvent.click(pickBox(GPT_PICK));

    fireEvent.click(screen.getByRole("button", { name: broad.question }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("TryIt switching recordings", () => {
  it("offers the other recording as a chip, and switching resets the replay", () => {
    renderTryIt();
    playTo(6000);

    fireEvent.click(screen.getByRole("button", { name: broad.question }));

    expect(screen.getByRole("button", { name: broad.question, pressed: true })).toBeInTheDocument();
    expect(elapsed()).toBe("0.00s");
    expect(playButton()).toHaveTextContent("▶ Play");
    expect(watchButton()).toBeInTheDocument();
    expect(within(drawer()).getByText(/The reply lands here/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Sources" })).not.toBeInTheDocument();
  });

  it("plays the broad recording to its own end", () => {
    renderTryIt();
    fireEvent.click(screen.getByRole("button", { name: broad.question }));
    playTo(2500, broad);

    expect(elapsed()).toBe("2.50s");
    expect(screen.getByRole("button", { name: "↻ Replay" })).toBeInTheDocument();
    expect(within(drawer()).getByText(/Start with LangGraph/)).toBeInTheDocument();
  });

  it("offers no switch chip when there is only one recording", () => {
    renderTryIt([search]);

    expect(screen.queryByRole("button", { name: broad.question })).not.toBeInTheDocument();
  });
});

describe("TryIt trace", () => {
  it("opens the full waterfall from the toggle, and hides it again", () => {
    renderTryIt();
    fireEvent.click(traceToggle());

    expect(traceToggle()).toHaveAttribute("aria-expanded", "true");
    expect(traceToggle()).toHaveTextContent("hide the trace ▴");
    expect(document.getElementById("colophon-trace")).not.toBeNull();
    // Main list: root, two rounds and the search; the three Jev steps fold into the search row.
    expect(within(screen.getByRole("list", { name: "Spans in this reply" })).getAllByRole("listitem")).toHaveLength(4);
    expect(screen.getByText("+3 jev")).toBeInTheDocument();
    expect(within(screen.getByRole("list", { name: "Retrieval spans, magnified" })).getAllByRole("listitem")).toHaveLength(4);

    fireEvent.click(traceToggle());
    expect(traceToggle()).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("colophon-trace")).toBeNull();
  });

  it("shows a pressed span's input and output in the span detail", () => {
    renderTryIt();
    fireEvent.click(traceToggle());

    const button = screen.getAllByRole("button", { name: "search_writing, 2.10s" })[0];
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(within(screen.getByLabelText("Span detail")).getByText("[1] Agents with LangGraph")).toBeInTheDocument();
  });

  it("lights a span's diagram boxes when it is hovered in the zoom, even before play, and leaves the rest idle", () => {
    const { container } = renderTryIt();
    fireEvent.click(traceToggle());

    fireEvent.mouseEnter(screen.getAllByRole("button", { name: "jev sections (score), 0.70s" })[0]);

    container.querySelectorAll('g[data-k="sections"]').forEach((g) => expect(g).toHaveAttribute("data-state", "lit"));
    container.querySelectorAll('g[data-k="gpt"]').forEach((g) => expect(g).toHaveAttribute("data-state", "idle"));
  });
});

describe("TryIt under prefers-reduced-motion", () => {
  beforeEach(() => {
    window.matchMedia = jest.fn(() => mediaQuery(true)) as unknown as typeof window.matchMedia;
  });

  it("jumps to the next milestone on Play, with no animation frame", () => {
    renderTryIt();
    fireEvent.click(watchButton()!);

    expect(queue).toHaveLength(0);
    expect(caption()).toBe(storySteps(search, 65)[1].text);
    expect(screen.getByRole("button", { name: BACK })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: NEXT })).toBeInTheDocument();
  });

  it("steps forward and back through the recorded moments", () => {
    renderTryIt();
    fireEvent.click(watchButton()!); // 1 ms
    fireEvent.click(screen.getByRole("button", { name: NEXT })); // 900 ms
    expect(elapsed()).toBe("0.90s");
    fireEvent.click(screen.getByRole("button", { name: NEXT })); // 901 ms
    fireEvent.click(screen.getByRole("button", { name: BACK })); // 900 ms
    expect(elapsed()).toBe("0.90s");
    fireEvent.click(screen.getByRole("button", { name: BACK })); // 1 ms
    expect(elapsed()).toBe("0.00s");
  });

  it("holds the answer back until the last step, then shows it with its sources", () => {
    renderTryIt();
    fireEvent.click(watchButton()!);
    for (let i = 0; i < 15; i++) fireEvent.click(screen.getByRole("button", { name: NEXT }));

    expect(screen.getByRole("button", { name: NEXT })).toBeDisabled();
    expect(within(drawer()).getByText(/wrote about LangGraph agents/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Sources" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "↻ Replay" })).toBeInTheDocument();
  });

  it("offers Resume after the first step, which moves on to the next milestone", () => {
    renderTryIt();
    fireEvent.click(watchButton()!);

    expect(screen.getByRole("button", { name: "▶ Resume" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "▶ Resume" }));
    expect(elapsed()).toBe("0.90s");
  });

  it("hides the stepping controls before anything has been played", () => {
    renderTryIt();

    expect(screen.queryByRole("button", { name: NEXT })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: BACK })).not.toBeInTheDocument();
  });
});

describe("storySteps answer line", () => {
  const answerLine = (sources: Recording["sources"]) =>
    storySteps({ ...search, sources }, 65)
      .map((s) => s.text)
      .find((t) => t.startsWith("GPT writes the answer"));

  it("names the one article when the reply cites a single source", () => {
    expect(answerLine([{ n: 1, title: "Agents with LangGraph", url: SRC_URL }])).toBe(
      "GPT writes the answer from my record and the article, citing it [1]."
    );
  });

  it("gives the citation range when the reply cites several sources", () => {
    expect(
      answerLine([
        { n: 1, title: "Agents with LangGraph", url: SRC_URL },
        { n: 2, title: "Helm charts", url: "https://medium.com/@tituslhy/helm" },
      ])
    ).toBe("GPT writes the answer from my record and the articles, citing them [1]–[2].");
  });

  it("says the answer comes from my record alone when it cites nothing", () => {
    expect(answerLine([])).toBe("GPT writes the answer from my record.");
  });
});
