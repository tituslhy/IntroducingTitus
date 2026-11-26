import type OpenAI from "openai";
import type { ResponseCreateParamsStreaming, ResponseInput, Tool } from "openai/resources/responses/responses";
import type { CopilotEvent, CopilotTool, Emit, StepLabels } from "@/lib/copilot-tools";
import { summaryHeadline } from "@/lib/copilot-steps";

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

/**
 * Reasoning summaries are asked for so the drawer can show what the model is thinking about before it picks a tool.
 * If the model or account refuses them (a 400 that names reasoning or summaries), the round is retried without,
 * and this instance stops asking. Any other error is thrown as before.
 */
let reasoningSummaries = true;

/** Test hook: ask for reasoning summaries again. */
export function resetReasoningSummaries(): void {
  reasoningSummaries = true;
}

type CreateParams = ResponseCreateParamsStreaming;

async function createRound(openai: OpenAI, params: CreateParams, signal: AbortSignal) {
  if (reasoningSummaries) {
    try {
      return await openai.responses.create({ ...params, reasoning: { summary: "auto" } }, { signal });
    } catch (err) {
      // Only a refusal of the summaries themselves turns them off; any other bad request is a real error.
      const message = err instanceof Error ? err.message : String(err);
      if ((err as { status?: unknown } | null)?.status !== 400 || !/reasoning|summar/i.test(message)) throw err;
      reasoningSummaries = false;
      console.warn(
        JSON.stringify({ event: "copilot_reasoning_summaries_off", message })
      );
    }
  }
  return openai.responses.create(params, { signal });
}

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
    const thoughts: string[] = [];
    let settled = false;
    try {
      const stream = await createRound(
        openai,
        {
          model: MODEL,
          stream: true,
          // Titus prefers fuller answers; the prompt still sets the shape (2–4 sentences, or the story).
          text: { verbosity: "high" },
          input: next,
          ...(previousId && { previous_response_id: previousId }),
          ...(offered.length > 0 && { tools: offered }),
        },
        signal
      );

      for await (const ev of stream) {
        if (ev.type === "response.output_text.delta") {
          text += ev.delta;
          yield { kind: "text", text: ev.delta };
        } else if (ev.type === "response.created") previousId = ev.response.id;
        else if (ev.type === "response.output_item.done" && ev.item.type === "function_call") calls.push(ev.item);
        else if (ev.type === "response.reasoning_summary_part.done") {
          // Guarded: a malformed summary is skipped, never allowed to break the reply.
          const raw: unknown = (ev as { part?: { text?: unknown } }).part?.text;
          const headline = typeof raw === "string" ? summaryHeadline(raw) : null;
          if (headline) {
            thoughts.push(headline);
            yield { kind: "event", event: { type: "thought", text: headline } };
          }
        }
      }
      settled = true;
      span.end({ text, function_calls: calls, response_id: previousId, ...(thoughts.length > 0 && { thoughts }) });
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

    // Checked first (budget, arguments), so the drawer only hears about calls that will really run.
    const admitted = calls.map((call) => admit(call, byName, used));
    const steps = admitted.flatMap((a) => (a.ok && a.labels ? [{ id: a.call.call_id, tool: a.call.name, labels: a.labels }] : []));
    for (const s of steps) yield { kind: "event", event: { type: "step", id: s.id, tool: s.tool, label: s.labels.doing, done: false } };

    // This step's calls run in parallel (e.g. search_writing + show_on_page).
    // Events flush once the step's tools finish.
    next = await Promise.all(
      admitted.map(async (a) => ({
        type: "function_call_output" as const,
        call_id: a.call.call_id,
        output: JSON.stringify(await runCall(a, { emit, signal }, observer)),
      }))
    );
    for (const event of events.splice(0)) yield { kind: "event", event };
    for (const s of steps) yield { kind: "event", event: { type: "step", id: s.id, tool: s.tool, label: s.labels.done, done: true } };
  }
}

type Admitted =
  | { ok: true; call: FunctionCall; tool: CopilotTool; args: unknown; labels: StepLabels | null }
  | { ok: false; call: FunctionCall; error: string };

/** Decides whether a call runs: a known tool, within its per-reply budget, with valid arguments. */
function admit(call: FunctionCall, byName: Map<string, CopilotTool>, used: Map<string, number>): Admitted {
  const tool = byName.get(call.name);
  if (!tool) return { ok: false, call, error: "unknown tool" };
  // Counted before validation: a malformed call still spends the tool's budget.
  const n = used.get(call.name) ?? 0;
  if (n >= tool.maxCallsPerReply) return { ok: false, call, error: "limit reached; answer with what you have" };
  used.set(call.name, n + 1);
  const args = tool.parse(call.arguments);
  if (args === null) return { ok: false, call, error: "invalid arguments" };
  let labels: StepLabels | null = null;
  try {
    labels = tool.describe?.(args) ?? null;
  } catch {
    // a progress line is never worth breaking the reply
  }
  return { ok: true, call, tool, args, labels };
}

async function runCall(
  admitted: Admitted,
  ctx: { emit: Emit; signal: AbortSignal },
  observer?: LoopObserver
): Promise<unknown> {
  const span = guard(() => observer?.toolStart(admitted.call));
  const result = await (async (): Promise<unknown> => {
    if (!admitted.ok) return { error: admitted.error };
    try {
      return await admitted.tool.run(admitted.args, { ...ctx, trace: span });
    } catch (err) {
      span.annotate({ thrown: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
      return { error: "tool failed" }; // a broken tool never breaks the reply
    }
  })();
  span.end({ result });
  return result;
}
