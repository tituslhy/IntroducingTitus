/**
 * @jest-environment node
 */

// Drives the real `langsmith` RunTree against a fake Client that records what
// would have been sent: createRun / updateRun, in call order. Nothing is
// posted anywhere.
import type { Client } from "langsmith";
import { ChatTrace } from "./copilot-tracing";

type Recorded =
  | { op: "create"; id: string; body: Record<string, unknown> }
  | { op: "update"; id: string; body: Record<string, unknown> };

function fakeClient() {
  const calls: Recorded[] = [];
  const client = {
    createRun: jest.fn(async (run: Record<string, unknown> & { id: string }) => {
      calls.push({ op: "create", id: run.id, body: run });
    }),
    updateRun: jest.fn(async (id: string, update: Record<string, unknown>) => {
      calls.push({ op: "update", id, body: update });
    }),
  };
  return { client: client as unknown as Client, calls };
}

const created = (calls: Recorded[], name: string) =>
  calls.find((c): c is Extract<Recorded, { op: "create" }> => c.op === "create" && c.body.name === name);
const updatesFor = (calls: Recorded[], id: string) => calls.filter((c) => c.op === "update" && c.id === id);
const input = [{ role: "user" as const, content: "What did you build at Illumina?" }];

describe("ChatTrace", () => {
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // RunTree logs patch/post failures itself; keep the test output clean.
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("posts a copilot-chat root run with the messages and a content hash, no parent", async () => {
    const { client, calls } = fakeClient();

    await ChatTrace.start(client, input);

    const root = created(calls, "copilot-chat")!;
    expect(root.body).toMatchObject({ run_type: "chain", inputs: { messages: input } });
    expect(root.body.parent_run_id).toBeUndefined();
    expect(root.body.extra).toMatchObject({
      metadata: { model: "gpt-6-luna", messageCount: 1, contentHash: expect.stringMatching(/^[0-9a-f]{64}$/) },
    });
  });

  it("nests a round, its tool call and the tool's Jev steps under the right parents", async () => {
    const { client, calls } = fakeClient();
    const trace = (await ChatTrace.start(client, input))!;
    const obs = trace.observer();

    const round = obs.roundStart(0, [], ["show_on_page", "search_writing"]);
    const tool = obs.toolStart({ call_id: "c1", name: "search_writing", arguments: '{"query":"guardrails"}' });
    tool.step("jev filter (noul)", {
      inputs: { query: "guardrails", articles: 65 },
      outputs: { model: "jev-test", shortlist: [{ slug: "a", relevance: 0.9 }] },
      startTime: 1_000,
      endTime: 1_400,
    });
    tool.step("jev rank (score)", { outputs: { ranked: [] }, startTime: 1_400, endTime: 1_900 });
    tool.end({ result: { articles: [] } });
    round.end({ text: "", function_calls: [], response_id: "resp_1" });
    await trace.finish({ answer: "" });

    const root = created(calls, "copilot-chat")!;
    const roundRun = created(calls, "gpt round 1")!;
    const toolRun = created(calls, "search_writing")!;
    const filter = created(calls, "jev filter (noul)")!;
    const rank = created(calls, "jev rank (score)")!;

    expect(roundRun.body).toMatchObject({ run_type: "llm", parent_run_id: root.id });
    expect(toolRun.body).toMatchObject({ run_type: "tool", parent_run_id: root.id });
    expect(toolRun.body.inputs).toEqual({ arguments: { query: "guardrails" }, call_id: "c1" });
    expect(filter.body).toMatchObject({ run_type: "tool", parent_run_id: toolRun.id });
    expect(rank.body).toMatchObject({ run_type: "tool", parent_run_id: toolRun.id });
  });

  it("gives Jev steps their real start and end times", async () => {
    const { client, calls } = fakeClient();
    const trace = (await ChatTrace.start(client, input))!;
    const tool = trace.observer().toolStart({ call_id: "c1", name: "search_writing", arguments: "{}" });

    tool.step("jev filter (noul)", { startTime: 1_000, endTime: 1_400, outputs: {} });
    tool.end({});
    await trace.finish({});

    const filter = created(calls, "jev filter (noul)")!;
    const [patch] = updatesFor(calls, filter.id);
    expect(new Date(filter.body.start_time as string).getTime()).toBe(1_000);
    expect(patch.body.end_time).toBe(1_400);
  });

  it("sends each run's outputs in its update, with annotations merged in", async () => {
    const { client, calls } = fakeClient();
    const trace = (await ChatTrace.start(client, input))!;
    const obs = trace.observer();
    const round = obs.roundStart(0, [], []);
    round.end({ text: "Hello", function_calls: [], response_id: "resp_9" });
    const tool = obs.toolStart({ call_id: "c2", name: "search_writing", arguments: "{}" });
    tool.annotate({ search: { fallback: "none" } });
    tool.end({ result: { articles: [] } });

    await trace.finish({ answer: "Hello", sources: [], rounds: 1, toolCalls: 1 });

    const roundRun = created(calls, "gpt round 1")!;
    const toolRun = created(calls, "search_writing")!;
    expect(updatesFor(calls, roundRun.id).at(-1)!.body.outputs).toEqual({
      text: "Hello",
      function_calls: [],
      response_id: "resp_9",
    });
    expect(updatesFor(calls, toolRun.id).at(-1)!.body.outputs).toEqual({
      result: { articles: [] },
      search: { fallback: "none" },
    });
  });

  it("sets the error on the failed round, and on the root when finish is given one", async () => {
    const { client, calls } = fakeClient();
    const trace = (await ChatTrace.start(client, input))!;
    const round = trace.observer().roundStart(0, [], []);
    round.fail(new TypeError("upstream down"));

    await trace.finish({ answer: "" }, "TypeError: upstream down");

    const roundRun = created(calls, "gpt round 1")!;
    expect(updatesFor(calls, roundRun.id).at(-1)!.body.error).toBe("TypeError: upstream down");
    const root = created(calls, "copilot-chat")!;
    expect(updatesFor(calls, root.id).at(-1)!.body).toMatchObject({ error: "TypeError: upstream down" });
  });

  it("prefixes a retry's run names, and counts each further retry", async () => {
    const { client, calls } = fakeClient();
    const trace = (await ChatTrace.start(client, input))!;

    trace.observer().roundStart(0, [], []).end({});
    trace.observer().roundStart(0, [], []).end({});
    trace.observer().roundStart(0, [], []).end({});
    await trace.finish({});

    expect(created(calls, "gpt round 1")).toBeDefined();
    expect(created(calls, "retry · gpt round 1")).toBeDefined();
    expect(created(calls, "retry 2 · gpt round 1")).toBeDefined();
  });

  it("never sends an update before the run it updates has been created", async () => {
    const { client, calls } = fakeClient();
    const trace = (await ChatTrace.start(client, input))!;
    const round = trace.observer().roundStart(0, [], []);
    const tool = trace.observer().toolStart({ call_id: "c1", name: "search_writing", arguments: "{}" });
    tool.step("jev filter (noul)", { startTime: 1, endTime: 2, outputs: {} });
    tool.end({});
    round.end({});

    await trace.finish({});

    for (const update of calls.filter((c) => c.op === "update")) {
      const createIndex = calls.findIndex((c) => c.op === "create" && c.id === update.id);
      const updateIndex = calls.indexOf(update);
      expect(createIndex).toBeGreaterThanOrEqual(0);
      expect(createIndex).toBeLessThan(updateIndex);
    }
  });

  it("resolves finish even when LangSmith rejects every update", async () => {
    const { client } = fakeClient();
    (client as unknown as { updateRun: jest.Mock }).updateRun = jest.fn(async () => {
      throw new Error("LangSmith is down");
    });
    const trace = (await ChatTrace.start(client, input))!;
    trace.observer().roundStart(0, [], []).end({});

    await expect(trace.finish({ answer: "" })).resolves.toBeUndefined();
  });

  it("returns a trace when the root run posts successfully", async () => {
    const { client } = fakeClient();

    await expect(ChatTrace.start(client, input)).resolves.toBeInstanceOf(ChatTrace);
  });

  it("still returns a trace when LangSmith rejects the root upload, and the reply can finish", async () => {
    const { client } = fakeClient();
    (client as unknown as { createRun: jest.Mock }).createRun = jest.fn(async () => {
      throw new Error("LangSmith is down");
    });

    const trace = await ChatTrace.start(client, input);

    expect(trace).toBeInstanceOf(ChatTrace);
    trace!.observer().roundStart(0, [], []).end({ text: "Hi", function_calls: [], response_id: "resp_1" });
    await expect(trace!.finish({ answer: "Hi" })).resolves.toBeUndefined();
    // The failed upload is logged by LangSmith itself, not surfaced to the caller.
    expect(errorSpy).toHaveBeenCalled();
  });
});
