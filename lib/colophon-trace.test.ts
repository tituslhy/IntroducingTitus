import {
  RecordingObserver,
  REPLAY_QUESTIONS,
  recordingProblems,
  sanitizeRoundInput,
  sanitizeRoundOutput,
  sanitizeStep,
  sanitizeToolResult,
  type ReplaySpan,
} from "./colophon-trace";

// The loop passes ResponseInput and FunctionCall values; hand-built fixtures are cast here.
const asInput = (v: unknown) => v as never;

/** A clock the tests move by hand; the observer reads it through now(). */
function makeClock(start: number) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v) };
}

const SYSTEM = "SECRET SYSTEM PROMPT: never show this";
const ARTICLE_BODY = "ARTICLE BODY: the whole section text";

describe("REPLAY_QUESTIONS", () => {
  it("offers the tool question first and the broad question second, with stable ids", () => {
    expect(REPLAY_QUESTIONS).toEqual([
      { id: "search", question: "Have you used LangChain and LangGraph?" },
      { id: "broad", question: "How would you build production-ready agents?" },
    ]);
  });
});

describe("sanitizeToolResult", () => {
  it("keeps only number, title, url and published for each article a search served", () => {
    const out = sanitizeToolResult("search_writing", {
      articles: [{ n: 1, title: "Agents", url: "https://medium.com/x", published: "2025-01-02", sections: ARTICLE_BODY, text: ARTICLE_BODY }],
      remaining: 4,
      errors: ["slow"],
      note: "ranked",
    });

    expect(out).toEqual({
      articles: [{ n: 1, title: "Agents", url: "https://medium.com/x", published: "2025-01-02" }],
      remaining: 4,
      errors: ["slow"],
      note: "ranked",
    });
    expect(JSON.stringify(out)).not.toContain("ARTICLE BODY");
  });

  it("applies the same article whitelist to read_writing", () => {
    const out = sanitizeToolResult("read_writing", {
      articles: [{ n: 2, title: "Helm", url: "u", published: "p", body: ARTICLE_BODY }],
    });

    expect(out).toEqual({ articles: [{ n: 2, title: "Helm", url: "u", published: "p" }] });
  });

  it("drops non-object articles and gives an empty list when articles is missing", () => {
    expect(sanitizeToolResult("search_writing", { articles: ["oops", null, { n: 3, title: "T", url: "u", published: "p" }] })).toEqual({
      articles: [{ n: 3, title: "T", url: "u", published: "p" }],
    });
    expect(sanitizeToolResult("search_writing", { remaining: 0 })).toEqual({ articles: [], remaining: 0 });
  });

  it("omits remaining, errors and note when they are not the right type", () => {
    expect(sanitizeToolResult("search_writing", { articles: [], remaining: "2", errors: "bad", note: 5 })).toEqual({ articles: [] });
  });

  it("keeps only the error message when the tool returned one", () => {
    expect(sanitizeToolResult("search_writing", { error: "limit reached", articles: [{ n: 1 }] })).toEqual({ error: "limit reached" });
  });

  it("copies a show_on_page result as it is", () => {
    expect(sanitizeToolResult("show_on_page", { ok: true, targets: ["lede"] })).toEqual({ ok: true, targets: ["lede"] });
  });

  it("returns an empty object for a non-object result or an unknown tool", () => {
    expect(sanitizeToolResult("search_writing", undefined)).toEqual({});
    expect(sanitizeToolResult("search_writing", "text")).toEqual({});
    expect(sanitizeToolResult("mystery_tool", { articles: [{ n: 1, title: "T", url: "u", published: "p" }] })).toEqual({});
  });
});

describe("sanitizeRoundInput", () => {
  const offered = ["show_on_page", "search_writing", "read_writing"];

  it("on round 1 keeps only the last user message and the offered tool names", () => {
    const out = sanitizeRoundInput(
      0,
      [
        { role: "system", content: SYSTEM },
        { role: "developer", content: SYSTEM },
        { role: "user", content: "First question" },
        { role: "assistant", content: "earlier answer" },
        { role: "user", content: "Have you used LangGraph?" },
      ],
      offered
    );

    expect(out).toEqual({ question: "Have you used LangGraph?", tools: offered });
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });

  it("on round 1 never returns a system message, even when it is the only message", () => {
    const out = sanitizeRoundInput(0, [{ role: "system", content: SYSTEM }], offered);

    expect(out).toEqual({ question: "", tools: offered });
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });

  it("on round 1 gives an empty question when the input is not a list", () => {
    expect(sanitizeRoundInput(0, "plain string", offered)).toEqual({ toolResults: 0, tools: offered });
  });

  it("on later rounds keeps only how many function_call_output items came back", () => {
    const out = sanitizeRoundInput(
      1,
      [
        { role: "system", content: SYSTEM },
        { role: "user", content: "Have you used LangGraph?" },
        { type: "function_call", call_id: "a", name: "search_writing", arguments: "{}" },
        { type: "function_call_output", call_id: "a", output: ARTICLE_BODY },
        { type: "function_call_output", call_id: "b", output: ARTICLE_BODY },
      ],
      offered
    );

    expect(out).toEqual({ toolResults: 2, tools: offered });
    expect(JSON.stringify(out)).not.toContain("SECRET");
    expect(JSON.stringify(out)).not.toContain("ARTICLE BODY");
    expect(out).not.toHaveProperty("question");
  });
});

describe("sanitizeRoundOutput", () => {
  it("parses each call's JSON arguments and keeps the text", () => {
    const out = sanitizeRoundOutput({
      text: "Looking.",
      function_calls: [{ call_id: "c1", name: "search_writing", arguments: '{"topics":["LangChain","LangGraph"],"more":false}' }],
    });

    expect(out).toEqual({
      calls: [{ name: "search_writing", arguments: { topics: ["LangChain", "LangGraph"], more: false } }],
      text: "Looking.",
    });
  });

  it("keeps unparseable arguments as the raw string", () => {
    const out = sanitizeRoundOutput({ function_calls: [{ call_id: "c", name: "read_writing", arguments: "{not json" }] });

    expect(out.calls).toEqual([{ name: "read_writing", arguments: "{not json" }]);
  });

  it("gives no calls and empty text when the outputs are missing or the wrong type", () => {
    expect(sanitizeRoundOutput(undefined)).toEqual({ calls: [], text: "" });
    expect(sanitizeRoundOutput({ function_calls: "nope", text: 42 })).toEqual({ calls: [], text: "" });
  });
});

describe("sanitizeStep", () => {
  it("keeps only the whitelisted keys of a jev filter step", () => {
    const out = sanitizeStep("jev filter (noul)", {
      inputs: { query: "LangChain", articles: 65, prompt: SYSTEM },
      outputs: { model: "jev-1", shortlist: [{ slug: "a", relevance: 0.9 }], nearMisses: [], raw: SYSTEM },
      startTime: 0,
      endTime: 1,
    });

    expect(out.inputs).toEqual({ query: "LangChain", articles: 65 });
    expect(out.outputs).toEqual({ model: "jev-1", shortlist: [{ slug: "a", relevance: 0.9 }], nearMisses: [] });
    expect(JSON.stringify(out)).not.toContain("SECRET");
  });

  it("keeps only the whitelisted keys of a jev rank step", () => {
    const out = sanitizeStep("jev rank (score)", {
      inputs: { query: "Q", shortlist: [{ slug: "a" }], extra: 1 },
      outputs: { ranked: [{ slug: "a", score: 3 }], junk: true },
      startTime: 0,
      endTime: 1,
    });

    expect(out).toEqual({ inputs: { query: "Q", shortlist: [{ slug: "a" }] }, outputs: { ranked: [{ slug: "a", score: 3 }] } });
  });

  it("keeps only focus and slug as inputs of a jev sections step", () => {
    const out = sanitizeStep("jev sections (score)", {
      inputs: { focus: "LangGraph", slug: "langgraph-agents", body: ARTICLE_BODY },
      outputs: { scored: [{ key: "State", score: 3 }], chosen: ["State"], fallback: "none", text: ARTICLE_BODY },
      startTime: 0,
      endTime: 1,
    });

    expect(out.inputs).toEqual({ focus: "LangGraph", slug: "langgraph-agents" });
    expect(out.outputs).toEqual({ scored: [{ key: "State", score: 3 }], chosen: ["State"], fallback: "none" });
    expect(JSON.stringify(out)).not.toContain("ARTICLE BODY");
  });

  it("drops every key of an unknown step, and tolerates missing inputs and outputs", () => {
    expect(sanitizeStep("something else", { inputs: { a: 1 }, outputs: { b: 2 }, startTime: 0, endTime: 1 })).toEqual({
      inputs: {},
      outputs: {},
    });
    expect(sanitizeStep("jev filter (noul)", { startTime: 0, endTime: 1 })).toEqual({ inputs: {}, outputs: {} });
  });
});

describe("RecordingObserver", () => {
  it("starts with a chain root named copilot-chat at time zero", () => {
    const clock = makeClock(1000);
    const rec = new RecordingObserver(clock.now);

    expect(rec.spans).toEqual([{ id: 0, parent: null, name: "copilot-chat", kind: "chain", start: 0, end: 0, inputs: {}, outputs: {} }]);
  });

  it("times spans relative to the clock at construction, not the wall clock", () => {
    const clock = makeClock(1000);
    const rec = new RecordingObserver(clock.now);
    clock.set(1100);
    const round = rec.roundStart(0, asInput([{ role: "user", content: "Q" }]), ["search_writing"]);
    clock.set(1400);
    round.end({ text: "", function_calls: [] });

    expect(rec.spans[1]).toMatchObject({ name: "gpt round 1", kind: "llm", parent: 0, start: 100, end: 400 });
  });

  it("names the round span from its round number, starting at one", () => {
    const clock = makeClock(0);
    const rec = new RecordingObserver(clock.now);
    rec.roundStart(0, asInput([]), []).end();
    rec.roundStart(1, asInput([]), []).end();

    expect(rec.spans.slice(1).map((s) => s.name)).toEqual(["gpt round 1", "gpt round 2"]);
  });

  it("records a tool span with its parsed arguments and only the served articles", () => {
    const clock = makeClock(1000);
    const rec = new RecordingObserver(clock.now);
    clock.set(1400);
    const tool = rec.toolStart({ call_id: "c1", name: "search_writing", arguments: '{"topics":["LangChain"],"more":false}' });
    clock.set(2000);
    tool.end({ result: { articles: [{ n: 1, title: "T", url: "u", published: "p", sections: ARTICLE_BODY }], remaining: 0 } });

    expect(rec.spans[1]).toMatchObject({
      name: "search_writing",
      kind: "tool",
      parent: 0,
      start: 400,
      end: 1000,
      inputs: { topics: ["LangChain"], more: false },
      outputs: { articles: [{ n: 1, title: "T", url: "u", published: "p" }], remaining: 0 },
    });
    expect(JSON.stringify(rec.spans)).not.toContain("ARTICLE BODY");
  });

  it("keeps a non-object tool argument under an arguments key", () => {
    const clock = makeClock(0);
    const rec = new RecordingObserver(clock.now);
    rec.toolStart({ call_id: "c", name: "show_on_page", arguments: "not json" }).end({ result: { ok: true } });

    expect(rec.spans[1].inputs).toEqual({ arguments: "not json" });
    expect(rec.spans[1].outputs).toEqual({ ok: true });
  });

  it("only the first end wins: a later end neither changes outputs nor moves the end time", () => {
    const clock = makeClock(0);
    const rec = new RecordingObserver(clock.now);
    const round = rec.roundStart(0, asInput([]), []);
    clock.set(50);
    round.end({ text: "first" });
    clock.set(90);
    round.end({ text: "second" });
    round.fail(new Error("late"));

    expect(rec.spans[1]).toMatchObject({ end: 50, outputs: { calls: [], text: "first" } });
    expect(rec.spans[1]).not.toHaveProperty("error");
  });

  it("records the message of an Error, or the string form of anything else, on fail", () => {
    const clock = makeClock(0);
    const rec = new RecordingObserver(clock.now);
    rec.toolStart({ call_id: "a", name: "search_writing", arguments: "{}" }).fail(new Error("boom"));
    rec.roundStart(0, asInput([]), []).fail("bad gateway");

    expect(rec.spans[1]).toMatchObject({ error: "boom", outputs: {} });
    expect(rec.spans[2]).toMatchObject({ error: "bad gateway", outputs: { calls: [], text: "" } });
  });

  it("attaches jev steps under the span that reported them, timed against t0", () => {
    const clock = makeClock(1000);
    const rec = new RecordingObserver(clock.now);
    const tool = rec.toolStart({ call_id: "c", name: "search_writing", arguments: '{"topics":["LangChain"]}' });
    tool.step("jev filter (noul)", {
      inputs: { query: "LangChain", articles: 65, secret: SYSTEM },
      outputs: { model: "jev-1", shortlist: [], nearMisses: [], junk: SYSTEM },
      startTime: 1150,
      endTime: 1700,
    });
    tool.step("jev rank (score)", { inputs: {}, outputs: {}, startTime: 1800, endTime: 1900, error: "timeout" });
    clock.set(2000);
    tool.end({ result: { articles: [] } });

    const [, , filter, rank] = rec.spans;
    expect(filter).toMatchObject({ name: "jev filter (noul)", kind: "jev", parent: 1, start: 150, end: 700 });
    expect(filter.inputs).toEqual({ query: "LangChain", articles: 65 });
    expect(filter.outputs).toEqual({ model: "jev-1", shortlist: [], nearMisses: [] });
    expect(rank).toMatchObject({ name: "jev rank (score)", kind: "jev", parent: 1, start: 800, end: 900, error: "timeout" });
    expect(JSON.stringify(rec.spans)).not.toContain("SECRET");
  });

  it("keeps the step's own error only when it has one", () => {
    const clock = makeClock(0);
    const rec = new RecordingObserver(clock.now);
    rec.roundStart(0, asInput([]), []).step("jev sections (score)", { startTime: 1, endTime: 2 });
    rec.roundStart(0, asInput([]), []).end();

    expect(rec.spans[2]).not.toHaveProperty("error");
  });

  it("finish closes the root with the total time and the given outputs", () => {
    const clock = makeClock(1000);
    const rec = new RecordingObserver(clock.now);
    clock.set(2600);
    const done = rec.finish({ answer: "Yes." });

    expect(done.totalMs).toBe(1600);
    expect(done.spans[0]).toMatchObject({ id: 0, parent: null, name: "copilot-chat", end: 1600, outputs: { answer: "Yes." } });
  });

  it("finish orders spans by start, keeps parents first on ties, and renumbers ids", () => {
    const clock = makeClock(1000);
    const rec = new RecordingObserver(clock.now);
    clock.set(1100);
    const round = rec.roundStart(0, asInput([{ role: "user", content: "Q" }]), ["search_writing"]);
    clock.set(1400);
    round.end({ text: "", function_calls: [{ call_id: "c", name: "search_writing", arguments: '{"topics":["A"]}' }] });
    const tool = rec.toolStart({ call_id: "c", name: "search_writing", arguments: '{"topics":["A"]}' });
    clock.set(2000);
    tool.end({ result: { articles: [] } });
    clock.set(2500);
    rec.roundStart(1, asInput([]), []).end({ text: "done" });

    const done = rec.finish({});

    expect(done.spans.map((s) => s.name)).toEqual(["copilot-chat", "gpt round 1", "search_writing", "gpt round 2"]);
    expect(done.spans.map((s) => s.id)).toEqual([0, 1, 2, 3]);
    expect(done.spans.map((s) => s.parent)).toEqual([null, 0, 0, 0]);
  });

  it("keeps parent links pointing at the right span when a step sorts before its parent", () => {
    const clock = makeClock(1000);
    const rec = new RecordingObserver(clock.now);
    clock.set(1400);
    const tool = rec.toolStart({ call_id: "c", name: "search_writing", arguments: "{}" });
    // A step timed earlier than the tool span that reported it (e.g. Jev's clock runs ahead).
    tool.step("jev filter (noul)", { inputs: {}, outputs: {}, startTime: 1100, endTime: 1200 });
    clock.set(1500);
    tool.end({ result: { articles: [] } });

    const { spans } = rec.finish({});
    const filter = spans.find((s) => s.name === "jev filter (noul)")!;
    const search = spans.find((s) => s.name === "search_writing")!;

    expect(spans.map((s) => s.name)).toEqual(["copilot-chat", "jev filter (noul)", "search_writing"]);
    expect(filter.parent).toBe(search.id);
    expect(spans[search.id].name).toBe("search_writing");
    expect(spans.every((s, i) => s.id === i)).toBe(true);
  });

  it("finish throws, naming the spans, when a span was never ended", () => {
    const clock = makeClock(0);
    const rec = new RecordingObserver(clock.now);
    rec.roundStart(0, asInput([]), []);
    rec.toolStart({ call_id: "c", name: "read_writing", arguments: "{}" }).end({ result: {} });

    expect(() => rec.finish({})).toThrow(/spans never ended: gpt round 1/);
  });

  it("produces a recording with no system prompt or article text anywhere, end to end", () => {
    const clock = makeClock(1000);
    const rec = new RecordingObserver(clock.now);
    clock.set(1050);
    const round = rec.roundStart(0, asInput([{ role: "system", content: SYSTEM }, { role: "user", content: "Q?" }]), ["search_writing"]);
    clock.set(1200);
    round.end({ text: "", function_calls: [{ call_id: "c1", name: "search_writing", arguments: '{"topics":["T"]}' }] });
    const tool = rec.toolStart({ call_id: "c1", name: "search_writing", arguments: '{"topics":["T"]}' });
    tool.step("jev sections (score)", {
      inputs: { focus: "T", slug: "a", body: ARTICLE_BODY },
      outputs: { scored: [], chosen: [], fallback: "none", body: ARTICLE_BODY },
      startTime: 1250,
      endTime: 1300,
    });
    clock.set(1400);
    tool.end({ result: { articles: [{ n: 1, title: "A", url: "u", published: "p", sections: ARTICLE_BODY }] } });
    clock.set(1500);
    rec.roundStart(1, asInput([{ role: "system", content: SYSTEM }, { type: "function_call_output", call_id: "c1", output: ARTICLE_BODY }]), []).end({
      text: "Answer [1]",
    });

    const json = JSON.stringify(rec.finish({ answer: "Answer [1]" }).spans);

    expect(json).not.toContain("SECRET SYSTEM PROMPT");
    expect(json).not.toContain("ARTICLE BODY");
    expect(json).toContain("Answer [1]");
  });
});

describe("recordingProblems", () => {
  const span = (over: Partial<ReplaySpan>): ReplaySpan => ({
    id: 1,
    parent: 0,
    name: "gpt round 1",
    kind: "llm",
    start: 0,
    end: 1,
    inputs: {},
    outputs: {},
    ...over,
  });

  it("reports nothing for a clean recording", () => {
    expect(recordingProblems([span({}), span({ id: 2, name: "search_writing", kind: "tool", outputs: { articles: [] } })])).toEqual([]);
  });

  it("flags a retry span", () => {
    expect(recordingProblems([span({ name: "retry gpt round 1" })])).toEqual(["retry span: retry gpt round 1"]);
  });

  it("flags a span that failed, with its error", () => {
    expect(recordingProblems([span({ name: "search_writing", error: "timeout" })])).toEqual(["search_writing failed: timeout"]);
  });

  it("flags a span whose outputs carry an error string", () => {
    expect(recordingProblems([span({ name: "search_writing", outputs: { error: "limit reached" } })])).toEqual([
      "search_writing returned an error: limit reached",
    ]);
  });

  it("ignores an outputs.error that is not a string", () => {
    expect(recordingProblems([span({ outputs: { error: { code: 1 } } })])).toEqual([]);
  });

  it("reports every problem in order when several spans are unusable", () => {
    const problems = recordingProblems([
      span({ id: 1, name: "retry gpt round 1" }),
      span({ id: 2, name: "jev rank (score)", kind: "jev", error: "boom" }),
      span({ id: 3, name: "read_writing", kind: "tool", outputs: { error: "missing ids" } }),
    ]);

    expect(problems).toEqual([
      "retry span: retry gpt round 1",
      "jev rank (score) failed: boom",
      "read_writing returned an error: missing ids",
    ]);
  });
});
