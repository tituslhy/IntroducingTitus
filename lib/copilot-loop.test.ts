import type OpenAI from "openai";
import { copilotStream, MAX_ROUNDS, resetReasoningSummaries, type LoopObserver, type TraceSpan } from "./copilot-loop";
import { createCopilotTools, type CopilotTool } from "./copilot-tools";
import { MAX_READING_CALLS } from "./search-config";
import type { Article } from "./articles";

type FakeEvent = Record<string, unknown>;

/** A fake Responses client: each create() call replays the next round's events (or throws). */
function fakeOpenAI(rounds: Array<FakeEvent[] | Error>) {
  const create = jest.fn(async (_params: Record<string, unknown>, _options?: unknown) => {
    const round = rounds.shift();
    if (round === undefined) throw new Error("unexpected extra create call");
    if (round instanceof Error) throw round;
    return (async function* () {
      for (const event of round) yield event;
    })();
  });
  return { openai: { responses: { create } } as unknown as OpenAI, create };
}

const created = (id: string): FakeEvent => ({ type: "response.created", response: { id } });
const text = (delta: string): FakeEvent => ({ type: "response.output_text.delta", delta });
const done: FakeEvent = { type: "response.done" };
const call = (call_id: string, name: string, args: string): FakeEvent => ({
  type: "response.output_item.done",
  item: { type: "function_call", name, arguments: args, call_id },
});

const echoTool: CopilotTool<string> = {
  definition: { type: "function", name: "echo", description: "Echo.", strict: true, parameters: {} },
  maxCallsPerReply: 2,
  parse: (raw) => raw,
  async run(args, { trace }) {
    trace?.annotate({ seen: true });
    return { echo: args };
  },
};

type Rec = {
  kind: "round" | "tool";
  label: string;
  offered?: string[];
  annotations: unknown[];
  steps: string[];
  ended?: Record<string, unknown>;
  failed?: unknown;
};

/** An observer that records what each span was told. */
function recordingObserver(overrides: Partial<LoopObserver> = {}) {
  const spans: Rec[] = [];
  const spanFor = (rec: Rec): TraceSpan => ({
    annotate: (data) => rec.annotations.push(data),
    step: (name) => rec.steps.push(name),
    end: (outputs) => {
      rec.ended = outputs ?? {};
    },
    fail: (err) => {
      rec.failed = err;
    },
  });
  const observer: LoopObserver = {
    roundStart: (round, _input, offered) => {
      const rec: Rec = { kind: "round", label: `round ${round}`, offered, annotations: [], steps: [] };
      spans.push(rec);
      return spanFor(rec);
    },
    toolStart: (c) => {
      const rec: Rec = { kind: "tool", label: c.name, annotations: [], steps: [] };
      spans.push(rec);
      return spanFor(rec);
    },
    ...overrides,
  };
  return { observer, spans };
}

async function collect(gen: AsyncGenerator<unknown>) {
  const items: unknown[] = [];
  for await (const item of gen) items.push(item);
  return items;
}

const input = [{ role: "user" as const, content: "Hello" }];

describe("copilotStream tracing hooks", () => {
  it("opens a round span with the offered tool names and ends it with text, calls and response id", async () => {
    const { openai } = fakeOpenAI([[created("resp_1"), text("Hi"), done], [created("resp_2"), text("Bye"), done]]);
    const { observer, spans } = recordingObserver();

    await collect(copilotStream(openai, input, [echoTool], new AbortController().signal, undefined, observer));

    expect(spans[0]).toMatchObject({ kind: "round", label: "round 0", offered: ["echo"] });
    expect(spans[0].ended).toEqual({ text: "Hi", function_calls: [], response_id: "resp_1" });
  });

  it("opens a tool span per call, passes it to the tool as trace, and ends it with the result", async () => {
    const { openai } = fakeOpenAI([
      [created("resp_1"), call("c1", "echo", '"hi"'), done],
      [created("resp_2"), text("Answer"), done],
    ]);
    const { observer, spans } = recordingObserver();

    await collect(copilotStream(openai, input, [echoTool], new AbortController().signal, undefined, observer));

    const tool = spans.find((s) => s.kind === "tool")!;
    expect(tool.label).toBe("echo");
    expect(tool.annotations).toEqual([{ seen: true }]);
    expect(tool.ended).toEqual({ result: { echo: '"hi"' } });
  });

  it("gives unknown tool names, exhausted budgets and invalid arguments their own spans with the error result", async () => {
    const strict: CopilotTool<string> = { ...echoTool, maxCallsPerReply: 1, parse: () => null };
    const { openai } = fakeOpenAI([
      [created("resp_1"), call("c1", "nope", "{}"), done],
      [created("resp_2"), call("c2", "echo", "{}"), done],
      [created("resp_3"), text("Done"), done],
    ]);
    const { observer, spans } = recordingObserver();

    await collect(copilotStream(openai, input, [strict], new AbortController().signal, undefined, observer));

    const tools = spans.filter((s) => s.kind === "tool");
    expect(tools.map((t) => t.ended)).toEqual([{ result: { error: "unknown tool" } }, { result: { error: "invalid arguments" } }]);
  });

  it("records a throwing tool as annotated thrown, and sends tool failed to the model", async () => {
    const broken: CopilotTool<string> = {
      ...echoTool,
      async run() {
        throw new Error("boom");
      },
    };
    const { openai, create } = fakeOpenAI([
      [created("resp_1"), call("c1", "echo", "{}"), done],
      [created("resp_2"), text("Recovered"), done],
    ]);
    const { observer, spans } = recordingObserver();

    const items = await collect(copilotStream(openai, input, [broken], new AbortController().signal, undefined, observer));

    const tool = spans.find((s) => s.kind === "tool")!;
    expect(tool.annotations).toEqual([{ thrown: "Error: boom" }]);
    expect(tool.ended).toEqual({ result: { error: "tool failed" } });
    expect(items).toContainEqual({ kind: "text", text: "Recovered" });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("fails the round span and rethrows when OpenAI errors", async () => {
    const failure = new Error("upstream down");
    const { openai } = fakeOpenAI([failure]);
    const { observer, spans } = recordingObserver();

    await expect(
      collect(copilotStream(openai, input, [echoTool], new AbortController().signal, undefined, observer))
    ).rejects.toBe(failure);

    expect(spans[0].failed).toBe(failure);
    expect(spans[0].ended).toBeUndefined();
  });

  it("ends the round span as stopped when the consumer stops early", async () => {
    const { openai } = fakeOpenAI([[created("resp_1"), text("one"), text("two"), done]]);
    const { observer, spans } = recordingObserver();

    for await (const item of copilotStream(openai, input, [echoTool], new AbortController().signal, undefined, observer)) {
      expect(item).toEqual({ kind: "text", text: "one" });
      break;
    }

    expect(spans[0].ended).toMatchObject({ stopped: true, text: "one" });
  });

  it("never runs or traces a function call emitted on the final round", async () => {
    const { openai, create } = fakeOpenAI([
      [created("resp_1"), call("c1", "echo", "{}"), done],
      [created("resp_2"), call("c2", "echo", "{}"), done],
      [created("resp_3"), call("c3", "echo", "{}"), done],
      [created("resp_4"), call("c4", "echo", "{}"), done],
    ]);
    const { observer, spans } = recordingObserver();

    await collect(copilotStream(openai, input, [echoTool], new AbortController().signal, undefined, observer));

    expect(create).toHaveBeenCalledTimes(4);
    expect(spans.filter((s) => s.kind === "round")).toHaveLength(4);
    // Three rounds ran tools; the fourth round's call was not run or traced.
    expect(spans.filter((s) => s.kind === "tool")).toHaveLength(3);
  });

  it("keeps the reply going when every observer and span method throws", async () => {
    const boom = () => {
      throw new Error("tracing broke");
    };
    const { openai } = fakeOpenAI([
      [created("resp_1"), call("c1", "echo", "{}"), done],
      [created("resp_2"), text("Answer"), done],
    ]);
    const brokenSpan: TraceSpan = { annotate: boom, step: boom, end: boom, fail: boom };
    const observer: LoopObserver = {
      roundStart: () => {
        throw new Error("roundStart broke");
      },
      toolStart: () => brokenSpan,
    };

    const items = await collect(copilotStream(openai, input, [echoTool], new AbortController().signal, undefined, observer));

    expect(items).toContainEqual({ kind: "text", text: "Answer" });
  });

  it("keeps the reply going when a round span's end throws", async () => {
    const { openai } = fakeOpenAI([[created("resp_1"), text("Still here"), done]]);
    const { observer } = recordingObserver({
      roundStart: () => ({
        annotate() {},
        step() {},
        end() {
          throw new Error("end broke");
        },
        fail() {},
      }),
    });

    const items = await collect(copilotStream(openai, input, [echoTool], new AbortController().signal, undefined, observer));

    expect(items).toContainEqual({ kind: "text", text: "Still here" });
  });
});

describe("copilotStream verbosity", () => {
  it("asks for high verbosity on every round, including the last round where function tools are withheld", async () => {
    // Four rounds, each making a call, so the loop runs to MAX_ROUNDS and every create() is observed.
    const { openai, create } = fakeOpenAI([
      [created("resp_1"), call("c1", "echo", "{}"), done],
      [created("resp_2"), call("c2", "echo", "{}"), done],
      [created("resp_3"), call("c3", "echo", "{}"), done],
      [created("resp_4"), text("Final"), done],
    ]);

    await collect(copilotStream(openai, input, [echoTool], new AbortController().signal));

    expect(create).toHaveBeenCalledTimes(MAX_ROUNDS);
    create.mock.calls.forEach(([params]) => {
      expect(params).toHaveProperty("text", { verbosity: "high" });
    });
    // The last round offers no function tools, so the verbosity setting is the only shape it carries.
    const lastParams = create.mock.calls[MAX_ROUNDS - 1][0];
    expect(lastParams).not.toHaveProperty("tools");
  });
});

describe("copilotStream per-reply limits on the writing tools", () => {
  const LIMIT_ERROR = { error: "limit reached; answer with what you have" };

  const fixture = (slug: string, id: string): Article => ({
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
  });
  const ids = ["aaaaaaaaaaaa", "bbbbbbbbbbbb", "cccccccccccc", "dddddddddddd"];
  const catalog = [fixture("alpha", ids[0]), fixture("beta", ids[1]), fixture("gamma", ids[2]), fixture("delta", ids[3])];

  /** Real writing tools with search and section picking stubbed out. */
  const writingTools = () =>
    createCopilotTools({
      catalog,
      search: jest.fn(async () => []),
      pick: jest.fn(async (article: { slug: string }, focus: string) => ({
        outline: [`O ${article.slug}`],
        sections: [{ heading: `H ${article.slug}`, text: `Picked ${article.slug} for ${focus}` }],
        truncated: false,
      })),
    });

  /** Runs one round that makes every given call at once, then a closing answer; returns each tool call's result in order. */
  async function resultsOf(calls: FakeEvent[]) {
    const { openai } = fakeOpenAI([[created("resp_1"), ...calls, done], [created("resp_2"), text("Answer"), done]]);
    const { observer, spans } = recordingObserver();

    await collect(copilotStream(openai, input, writingTools(), new AbortController().signal, undefined, observer));

    return spans.filter((s) => s.kind === "tool").map((s) => s.ended?.result);
  }

  it("refuses the 4th read_writing call in one reply and allows the 3rd", async () => {
    const reads = ids.map((id, i) => call(`r${i}`, "read_writing", JSON.stringify({ articles: [id], focus: "f" })));

    const results = await resultsOf(reads);

    expect(results).toHaveLength(MAX_READING_CALLS + 1);
    expect(results[MAX_READING_CALLS - 1]).not.toEqual(LIMIT_ERROR);
    expect(results[MAX_READING_CALLS - 1]).toMatchObject({ articles: [{ title: "Title gamma" }] });
    expect(results[MAX_READING_CALLS]).toEqual(LIMIT_ERROR);
  });

  it("refuses the 4th search_writing call in one reply and allows the 3rd", async () => {
    const searches = ids.map((_, i) => call(`s${i}`, "search_writing", JSON.stringify({ topics: [`topic ${i}`], more: false })));

    const results = await resultsOf(searches);

    expect(results).toHaveLength(MAX_READING_CALLS + 1);
    expect(results[MAX_READING_CALLS - 1]).not.toEqual(LIMIT_ERROR);
    expect(results[MAX_READING_CALLS]).toEqual(LIMIT_ERROR);
  });
});

describe("copilotStream tool steps", () => {
  /** A tool that describes itself and emits one source while it runs, so the event order can be checked. */
  const labelled: CopilotTool<string> = {
    definition: { type: "function", name: "labelled", description: "Labelled.", strict: true, parameters: {} },
    maxCallsPerReply: 3,
    parse: (raw) => (raw === "bad" ? null : raw),
    describe: (args) => ({ doing: `Doing ${args}`, done: `Did ${args}` }),
    async run(args, { emit }) {
      emit({ type: "source", n: 1, title: `Source ${args}`, url: "https://medium.com/@tituslhy/x", relevance: null, score: null });
      return { ok: args };
    },
  };

  /** The step events in a reply, in the order they were yielded. */
  const stepsOf = (items: unknown[]) =>
    items.flatMap((i) => {
      const event = (i as { event?: { type: string } }).event;
      return event?.type === "step" ? [event as { type: "step"; id: string; tool: string; label: string; done: boolean }] : [];
    });

  /** The tool's results sent back to the model in round two, keyed by call id. */
  const sentBack = (create: jest.Mock) =>
    Object.fromEntries((create.mock.calls[1][0].input as Array<{ call_id: string; output: string }>).map((o) => [o.call_id, JSON.parse(o.output)]));

  it("yields a step with the doing label before the tool runs, and the done label after its events are flushed", async () => {
    const { openai } = fakeOpenAI([
      [created("resp_1"), call("c1", "labelled", '"alpha"'), done],
      [created("resp_2"), text("Answer"), done],
    ]);

    const items = await collect(copilotStream(openai, input, [labelled], new AbortController().signal));

    expect(items).toEqual([
      { kind: "event", event: { type: "step", id: "c1", tool: "labelled", label: "Doing \"alpha\"", done: false } },
      { kind: "event", event: { type: "source", n: 1, title: 'Source "alpha"', url: "https://medium.com/@tituslhy/x", relevance: null, score: null } },
      { kind: "event", event: { type: "step", id: "c1", tool: "labelled", label: "Did \"alpha\"", done: true } },
      { kind: "text", text: "Answer" },
    ]);
  });

  it("yields the doing steps for a whole round before any finish, and finishes each call by its own id", async () => {
    const { openai } = fakeOpenAI([
      [created("resp_1"), call("c1", "labelled", '"a"'), call("c2", "labelled", '"b"'), done],
      [created("resp_2"), text("Answer"), done],
    ]);

    const items = await collect(copilotStream(openai, input, [labelled], new AbortController().signal));

    expect(stepsOf(items).map((s) => `${s.id}:${s.done}`)).toEqual(["c1:false", "c2:false", "c1:true", "c2:true"]);
  });

  it("sends no step for a tool that has no describe", async () => {
    const { openai } = fakeOpenAI([
      [created("resp_1"), call("c1", "echo", '"hi"'), done],
      [created("resp_2"), text("Answer"), done],
    ]);

    const items = await collect(copilotStream(openai, input, [echoTool], new AbortController().signal));

    expect(stepsOf(items)).toEqual([]);
  });

  it("sends no step when describe returns null, and the tool still runs", async () => {
    const quiet: CopilotTool<string> = { ...labelled, describe: () => null };
    const { openai, create } = fakeOpenAI([
      [created("resp_1"), call("c1", "labelled", '"a"'), done],
      [created("resp_2"), text("Answer"), done],
    ]);

    const items = await collect(copilotStream(openai, input, [quiet], new AbortController().signal));

    expect(stepsOf(items)).toEqual([]);
    expect(sentBack(create).c1).toEqual({ ok: '"a"' });
  });

  it("sends no step for a call that is rejected: unknown tool, over the per-reply limit, or invalid arguments", async () => {
    const capped: CopilotTool<string> = { ...labelled, maxCallsPerReply: 1 };
    const { openai } = fakeOpenAI([
      [created("resp_1"), call("c1", "nope", "{}"), call("c2", "labelled", '"a"'), call("c3", "labelled", '"b"'), call("c4", "labelled", "bad"), done],
      [created("resp_2"), text("Answer"), done],
    ]);

    const items = await collect(copilotStream(openai, input, [capped], new AbortController().signal));

    const stepIds = stepsOf(items).map((s) => s.id);
    // Only c2 was admitted: c3 is over the limit and c4 has invalid arguments.
    expect(stepIds).toEqual(["c2", "c2"]);
  });

  it("keeps the reply going when describe throws: no step, and the tool still runs", async () => {
    const broken: CopilotTool<string> = {
      ...labelled,
      describe: () => {
        throw new Error("label broke");
      },
    };
    const { openai, create } = fakeOpenAI([
      [created("resp_1"), call("c1", "labelled", '"a"'), done],
      [created("resp_2"), text("Answer"), done],
    ]);

    const items = await collect(copilotStream(openai, input, [broken], new AbortController().signal));

    expect(stepsOf(items)).toEqual([]);
    expect(items).toContainEqual({ kind: "text", text: "Answer" });
    expect(sentBack(create).c1).toEqual({ ok: '"a"' });
  });

  it("sends no step for a call on the final round, which is never run", async () => {
    const { openai } = fakeOpenAI([
      [created("resp_1"), call("c1", "labelled", '"a"'), done],
      [created("resp_2"), call("c2", "labelled", '"b"'), done],
      [created("resp_3"), call("c3", "labelled", '"c"'), done],
      [created("resp_4"), call("c4", "labelled", '"d"'), done],
    ]);

    const items = await collect(copilotStream(openai, input, [labelled], new AbortController().signal));

    expect(stepsOf(items).map((s) => s.id)).not.toContain("c4");
  });
});

describe("reasoning summaries", () => {
  const signal = () => new AbortController().signal;
  const reasoningDone = (text: string): FakeEvent => ({
    type: "response.reasoning_summary_part.done",
    part: { type: "summary_text", text },
  });
  const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status });
  const REFUSAL = "Unsupported parameter: 'reasoning.summary' is not supported with this model.";
  /** The 400 a model gives when it refuses the reasoning summaries themselves. */
  const refusal = () => Object.assign(new Error(REFUSAL), { status: 400 });
  /** Whether each create() call asked for reasoning, in call order. */
  const asked = (create: jest.Mock) => create.mock.calls.map(([params]) => "reasoning" in (params as object));

  let warn: jest.SpyInstance;
  beforeEach(() => {
    resetReasoningSummaries();
    warn = jest.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    resetReasoningSummaries();
    jest.restoreAllMocks();
  });

  describe("asking for them", () => {
    it("asks for an auto summary on every round of a reply", async () => {
      const { openai, create } = fakeOpenAI([
        [created("resp_1"), call("c1", "echo", '"x"'), done],
        [created("resp_2"), text("Answer"), done],
      ]);

      await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(create.mock.calls.map(([params]) => (params as { reasoning?: unknown }).reasoning)).toEqual([
        { summary: "auto" },
        { summary: "auto" },
      ]);
    });

    it("does not change the rest of the request when it asks for a summary", async () => {
      const { openai, create } = fakeOpenAI([[created("resp_1"), text("Answer"), done]]);

      await collect(copilotStream(openai, input, [echoTool], signal()));

      const params = create.mock.calls[0][0] as Record<string, unknown>;
      expect(params).toMatchObject({ model: "gpt-6-luna", stream: true, text: { verbosity: "high" }, input, tools: [expect.any(Object)] });
    });
  });

  describe("when the model refuses them (400)", () => {
    it("retries the same round without reasoning, warns once, and carries on", async () => {
      const { openai, create } = fakeOpenAI([
        refusal(),
        [created("resp_1"), call("c1", "echo", '"x"'), done],
        [created("resp_2"), text("Answer"), done],
      ]);

      const items = await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(asked(create)).toEqual([true, false, false]);
      expect(items).toContainEqual({ kind: "text", text: "Answer" });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(JSON.parse(warn.mock.calls[0][0])).toMatchObject({ event: "copilot_reasoning_summaries_off", message: REFUSAL });
    });

    it("stops asking in later replies on the same instance, without warning again", async () => {
      const { openai, create } = fakeOpenAI([
        refusal(),
        [created("resp_1"), text("One"), done],
        [created("resp_2"), text("Two"), done],
      ]);

      await collect(copilotStream(openai, input, [echoTool], signal()));
      await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(asked(create)).toEqual([true, false, false]);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("throws the retry's own error when the retry without reasoning fails too, without a further retry", async () => {
      const retryFailure = refusal();
      const { openai, create } = fakeOpenAI([refusal(), retryFailure]);

      await expect(collect(copilotStream(openai, input, [echoTool], signal()))).rejects.toBe(retryFailure);

      expect(create).toHaveBeenCalledTimes(2);
    });

    it("sends no reasoning for the rest of a reply's rounds once it has been refused", async () => {
      const { openai, create } = fakeOpenAI([
        refusal(),
        [created("resp_1"), call("c1", "echo", '"x"'), done],
        [created("resp_2"), call("c2", "echo", '"y"'), done],
        [created("resp_3"), text("Answer"), done],
      ]);

      await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(asked(create)).toEqual([true, false, false, false]);
      expect(warn).toHaveBeenCalledTimes(1);
    });
  });

  describe("when the error is not a 400", () => {
    it.each([
      ["a 500", () => httpError(500)],
      ["a 429", () => httpError(429)],
      ["an error with no status", () => new Error("network down")],
    ])("rethrows %s unchanged, with no retry and no warning", async (_label, make) => {
      const failure = make();
      const { openai, create } = fakeOpenAI([failure]);

      await expect(collect(copilotStream(openai, input, [echoTool], signal()))).rejects.toBe(failure);

      expect(create).toHaveBeenCalledTimes(1);
      expect(warn).not.toHaveBeenCalled();
    });

    it("keeps asking for reasoning after a non-400 failure", async () => {
      const { openai, create } = fakeOpenAI([httpError(500), [created("resp_1"), text("Answer"), done]]);

      await expect(collect(copilotStream(openai, input, [echoTool], signal()))).rejects.toThrow("HTTP 500");
      await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(asked(create)).toEqual([true, true]);
    });
  });

  describe("thoughts", () => {
    it("yields a thought for each summary headline, in stream order before the text that follows it", async () => {
      const { openai } = fakeOpenAI([
        [created("resp_1"), reasoningDone("**Looking up the Illumina role**\n\nI need to check the dates."), text("Answer"), done],
      ]);

      const items = await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(items).toEqual([
        { kind: "event", event: { type: "thought", text: "Looking up the Illumina role" } },
        { kind: "text", text: "Answer" },
      ]);
    });

    it("yields nothing for a summary with no headline", async () => {
      const { openai } = fakeOpenAI([[created("resp_1"), reasoningDone("I need to check the dates."), text("Answer"), done]]);

      const items = await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(items).toEqual([{ kind: "text", text: "Answer" }]);
    });

    it("sends the thoughts to the round span, and leaves the key out when there were none", async () => {
      const { observer, spans } = recordingObserver();
      const withThought = fakeOpenAI([[created("resp_1"), reasoningDone("**Checking my writing**\n\nx"), text("Hi"), done]]);
      await collect(copilotStream(withThought.openai, input, [echoTool], signal(), undefined, observer));
      expect(spans[0].ended).toEqual({ text: "Hi", function_calls: [], response_id: "resp_1", thoughts: ["Checking my writing"] });

      spans.length = 0;
      const without = fakeOpenAI([[created("resp_2"), reasoningDone("No headline."), text("Hi"), done]]);
      await collect(copilotStream(without.openai, input, [echoTool], signal(), undefined, observer));
      expect(spans[0].ended).not.toHaveProperty("thoughts");
    });
  });

  describe("a 400 that does not mention reasoning", () => {
    it("is rethrown unchanged, with no retry and no warning", async () => {
      const failure = Object.assign(new Error("Invalid value for 'input'."), { status: 400 });
      const { openai, create } = fakeOpenAI([failure]);

      await expect(collect(copilotStream(openai, input, [echoTool], signal()))).rejects.toBe(failure);

      expect(create).toHaveBeenCalledTimes(1);
      expect(asked(create)).toEqual([true]);
      expect(warn).not.toHaveBeenCalled();
    });

    it("keeps asking for reasoning in the next reply", async () => {
      const failure = Object.assign(new Error("Invalid value for 'input'."), { status: 400 });
      const { openai, create } = fakeOpenAI([failure, [created("resp_1"), text("Answer"), done]]);

      await expect(collect(copilotStream(openai, input, [echoTool], signal()))).rejects.toBe(failure);
      await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(asked(create)).toEqual([true, true]);
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe("malformed reasoning events", () => {
    it.each([
      ["no part at all", { type: "response.reasoning_summary_part.done" }],
      ["a part with no text", { type: "response.reasoning_summary_part.done", part: { type: "summary_text" } }],
      ["a part whose text is not a string", { type: "response.reasoning_summary_part.done", part: { type: "summary_text", text: 42 } }],
      ["a part that is null", { type: "response.reasoning_summary_part.done", part: null }],
    ])("skips %s and still streams the text", async (_label, bad) => {
      const { openai } = fakeOpenAI([[created("resp_1"), bad, text("Answer"), done]]);

      const items = await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(items).toEqual([{ kind: "text", text: "Answer" }]);
    });

    it("keeps the good thoughts around a malformed one", async () => {
      const { openai } = fakeOpenAI([
        [
          created("resp_1"),
          reasoningDone("**First idea**\n\nx"),
          { type: "response.reasoning_summary_part.done", part: null },
          reasoningDone("**Second idea**\n\ny"),
          text("Answer"),
          done,
        ],
      ]);

      const items = await collect(copilotStream(openai, input, [echoTool], signal()));

      expect(items).toEqual([
        { kind: "event", event: { type: "thought", text: "First idea" } },
        { kind: "event", event: { type: "thought", text: "Second idea" } },
        { kind: "text", text: "Answer" },
      ]);
    });
  });

});
