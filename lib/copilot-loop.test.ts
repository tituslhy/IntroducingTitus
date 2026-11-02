import type OpenAI from "openai";
import { copilotStream, type LoopObserver, type TraceSpan } from "./copilot-loop";
import type { CopilotTool } from "./copilot-tools";

type FakeEvent = Record<string, unknown>;

/** A fake Responses client: each create() call replays the next round's events (or throws). */
function fakeOpenAI(rounds: Array<FakeEvent[] | Error>) {
  const create = jest.fn(async () => {
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
