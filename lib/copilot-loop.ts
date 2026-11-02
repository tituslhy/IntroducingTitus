import type OpenAI from "openai";
import type { ResponseInput, Tool } from "openai/resources/responses/responses";
import type { CopilotEvent, CopilotTool, Emit } from "@/lib/copilot-tools";

// ---------------------------------------------------------------------------
// The copilot's agent loop: a bounded, general tool loop on the OpenAI
// Responses API. Shared by /api/chat and scripts/eval-writing.ts, so the
// golden set exercises exactly what visitors get.
// ---------------------------------------------------------------------------

export const MODEL = "gpt-6-luna";
export const MAX_ROUNDS = 4;

/**
 * Hosted tools run on OpenAI's side and are offered every round. None now:
 * my writing is answered by search_writing, from my own articles, not the web.
 */
export const HOSTED_TOOLS: Tool[] = [];

export type InputMessage = { role: "system" | "user" | "assistant"; content: string };

export type CopilotChunk = { kind: "text"; text: string } | { kind: "event"; event: CopilotEvent };

/** Counters for the request log line; accumulates across attempts if reused. */
export type LoopStats = { rounds: number; toolCalls: number };

export type FunctionCall = { call_id: string; name: string; arguments: string };

// ---------------------------------------------------------------------------
// Tracing hooks. The loop knows nothing about LangSmith: it reports rounds
// and tool calls to an optional observer (lib/copilot-tracing.ts). Every
// hook is guarded, so a tracing failure can never break a reply.
// ---------------------------------------------------------------------------

/** A finished sub-step recorded after the fact (e.g. Jev's filter and rank stages). */
export type TraceStep = {
  inputs?: Record<string, unknown>;
  outputs?: Record<string, unknown>;
  startTime: number;
  endTime: number;
  error?: string;
};

export interface TraceSpan {
  /** Extra outputs merged into this span when it ends. */
  annotate(data: Record<string, unknown>): void;
  /** Records a completed child step under this span. */
  step(name: string, step: TraceStep): void;
  end(outputs?: Record<string, unknown>): void;
  fail(err: unknown): void;
}

export interface LoopObserver {
  roundStart(round: number, input: ResponseInput, offered: string[]): TraceSpan;
  toolStart(call: FunctionCall): TraceSpan;
}

const NOOP_SPAN: TraceSpan = { annotate() {}, step() {}, end() {}, fail() {} };

/** Wraps a span so none of its methods can throw into the loop. */
function guard(open: () => TraceSpan | undefined): TraceSpan {
  let span: TraceSpan;
  try {
    span = open() ?? NOOP_SPAN;
  } catch {
    return NOOP_SPAN;
  }
  const safe =
    <A extends unknown[]>(fn: (...a: A) => void) =>
    (...a: A) => {
      try {
        fn.apply(span, a);
      } catch {
        // tracing must never affect the reply
      }
    };
  return { annotate: safe(span.annotate), step: safe(span.step), end: safe(span.end), fail: safe(span.fail) };
}

const toolName = (t: Tool) => ("name" in t && typeof t.name === "string" ? t.name : t.type);

export async function* copilotStream(
  openai: OpenAI,
  input: InputMessage[],
  tools: CopilotTool[],
  signal: AbortSignal,
  statsIn?: LoopStats,
  observer?: LoopObserver
): AsyncGenerator<CopilotChunk> {
  const stats = statsIn ?? { rounds: 0, toolCalls: 0 };
  const byName = new Map(tools.map((t) => [t.definition.name, t]));
  const used = new Map<string, number>();
  const events: CopilotEvent[] = [];
  const emit: Emit = (e) => events.push(e);

  let next: ResponseInput = input;
  let previousId: string | undefined;

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const lastRound = round === MAX_ROUNDS - 1;
    // Function tools are withheld on the last round, so the loop always ends in an answer.
    const offered: Tool[] = lastRound ? HOSTED_TOOLS : [...HOSTED_TOOLS, ...tools.map((t) => t.definition)];
    stats.rounds++;
    const span = guard(() => observer?.roundStart(round, next, offered.map(toolName)));
    const calls: FunctionCall[] = [];
    let text = "";
    let settled = false;
    try {
      const stream = await openai.responses.create(
        {
          model: MODEL,
          stream: true,
          input: next,
          ...(previousId && { previous_response_id: previousId }),
          ...(offered.length > 0 && { tools: offered }),
        },
        { signal }
      );

      for await (const ev of stream) {
        if (ev.type === "response.output_text.delta") {
          text += ev.delta;
          yield { kind: "text", text: ev.delta };
        } else if (ev.type === "response.created") previousId = ev.response.id;
        else if (ev.type === "response.output_item.done" && ev.item.type === "function_call") calls.push(ev.item);
      }
      settled = true;
      span.end({ text, function_calls: calls, response_id: previousId });
    } catch (err) {
      settled = true;
      span.fail(err);
      throw err;
    } finally {
      // The consumer stopped early (output cap, timeout): close what was seen.
      if (!settled) span.end({ text, function_calls: calls, response_id: previousId, stopped: true });
    }

    // Tool results can only be returned by chaining onto the previous response.
    // Calls on the last round were never offered, so they are never run.
    if (calls.length === 0 || !previousId || lastRound) return;
    stats.toolCalls += calls.length;

    // This step's calls run in parallel (e.g. search_writing + show_on_page).
    // Events flush once the step's tools finish.
    next = await Promise.all(
      calls.map(async (call) => ({
        type: "function_call_output" as const,
        call_id: call.call_id,
        output: JSON.stringify(await runCall(call, byName, used, { emit, signal }, observer)),
      }))
    );
    for (const event of events.splice(0)) yield { kind: "event", event };
  }
}

async function runCall(
  call: FunctionCall,
  byName: Map<string, CopilotTool>,
  used: Map<string, number>,
  ctx: { emit: Emit; signal: AbortSignal },
  observer?: LoopObserver
): Promise<unknown> {
  const span = guard(() => observer?.toolStart(call));
  const result = await (async (): Promise<unknown> => {
    const tool = byName.get(call.name);
    if (!tool) return { error: "unknown tool" };
    // Counted before validation: a malformed call still spends the tool's budget.
    const n = used.get(call.name) ?? 0;
    if (n >= tool.maxCallsPerReply) return { error: "limit reached; answer with what you have" };
    used.set(call.name, n + 1);
    const args = tool.parse(call.arguments);
    if (args === null) return { error: "invalid arguments" };
    try {
      return await tool.run(args, { ...ctx, trace: span });
    } catch (err) {
      span.annotate({ thrown: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
      return { error: "tool failed" }; // a broken tool never breaks the reply
    }
  })();
  span.end({ result });
  return result;
}
