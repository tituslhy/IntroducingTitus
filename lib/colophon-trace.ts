// ---------------------------------------------------------------------------
// Recorded replies for the colophon's "Try it" panel.
//
// `npm run colophon:record` runs two questions through the real loop with a
// RecordingObserver (the same hooks LangSmith tracing uses) and writes
// content/colophon-traces.json. The page replays that file; it never calls a
// model. What is kept is sanitised here, once, so nothing private can reach
// the page: never the system prompt or any system message, never article
// text (titles, headings and Jev's scores only).
// ---------------------------------------------------------------------------

import type { FunctionCall, LoopObserver, TraceSpan, TraceStep } from "@/lib/copilot-loop";

export type SpanKind = "chain" | "llm" | "tool" | "jev";

export type ReplaySpan = {
  id: number;
  /** The enclosing span's id; null for the root. */
  parent: number | null;
  name: string;
  kind: SpanKind;
  /** Milliseconds from the start of the request. */
  start: number;
  end: number;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  error?: string;
};

export type ReplaySource = { n: number; title: string; url: string };

export type Recording = {
  /** Which replay: the search route or the broad (library-map) route. */
  id: "search" | "broad";
  question: string;
  /** ISO date-time of the run. */
  recordedAt: string;
  models: { gpt: string; jev: string };
  totalMs: number;
  spans: ReplaySpan[];
  answer: string;
  /** show_on_page targets the reply offered, in order. */
  actions: string[];
  sources: ReplaySource[];
};

export type ColophonTraces = { recordings: Recording[] };

/** A recorded tool call as the drawer showed it: its two labels and when it ran (ms into the recording). */
export type ReplayStep = { id: string; tool: string; doing: string; done: string; start: number; end: number };

/** The two questions, in the order the panel offers them. */
export const REPLAY_QUESTIONS: { id: Recording["id"]; question: string }[] = [
  { id: "search", question: "Have you used LangChain and LangGraph?" },
  { id: "broad", question: "How would you design production-ready agents?" },
];

// ---------------------------------------------------------------------------
// Sanitising
// ---------------------------------------------------------------------------

type KV = Record<string, unknown>;

const isObj = (v: unknown): v is KV => typeof v === "object" && v !== null && !Array.isArray(v);

function parseArgs(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** An article the tool served, without its text: number, title, link, date. */
function servedArticle(a: unknown): KV | null {
  if (!isObj(a)) return null;
  const { n, title, url, published } = a;
  return { n, title, url, published };
}

/** search_writing / read_writing results keep which articles were served, never what they say. */
export function sanitizeToolResult(name: string, result: unknown): KV {
  if (!isObj(result)) return {};
  if (typeof result.error === "string") return { error: result.error };
  if (name === "search_writing" || name === "read_writing") {
    const articles = Array.isArray(result.articles) ? result.articles.map(servedArticle).filter(Boolean) : [];
    const out: KV = { articles };
    if (typeof result.remaining === "number") out.remaining = result.remaining;
    if (Array.isArray(result.errors)) out.errors = result.errors;
    if (typeof result.note === "string") out.note = result.note;
    return out;
  }
  if (name === "show_on_page") return isObj(result) ? { ...result } : {};
  return {};
}

/** A GPT round's input: on the first round only the visitor's message; later rounds only how many tool results came back. */
export function sanitizeRoundInput(round: number, input: unknown, offered: string[]): KV {
  if (round === 0 && Array.isArray(input)) {
    const users = input.filter((m) => isObj(m) && m.role === "user");
    const last = users[users.length - 1];
    return { question: isObj(last) ? last.content : "", tools: offered };
  }
  const results = Array.isArray(input) ? input.filter((m) => isObj(m) && m.type === "function_call_output").length : 0;
  return { toolResults: results, tools: offered };
}

/** A GPT round's output: the calls it made (name + arguments) and its text. */
export function sanitizeRoundOutput(outputs: KV | undefined): KV {
  const calls = Array.isArray(outputs?.function_calls) ? (outputs.function_calls as FunctionCall[]) : [];
  return {
    calls: calls.map((c) => ({ name: c.name, arguments: parseArgs(c.arguments) })),
    text: typeof outputs?.text === "string" ? outputs.text : "",
  };
}

/** Jev steps already carry only slugs, queries and scores; keep them as recorded, minus anything else. */
export function sanitizeStep(name: string, step: TraceStep): { inputs: KV; outputs: KV } {
  const keep = (o: KV | undefined, keys: string[]) =>
    Object.fromEntries(keys.filter((k) => o && k in o).map((k) => [k, (o as KV)[k]]));
  if (name.startsWith("jev filter"))
    return { inputs: keep(step.inputs, ["query", "articles"]), outputs: keep(step.outputs, ["model", "shortlist", "nearMisses"]) };
  if (name.startsWith("jev rank"))
    return { inputs: keep(step.inputs, ["query", "shortlist"]), outputs: keep(step.outputs, ["ranked"]) };
  if (name.startsWith("jev sections"))
    return { inputs: keep(step.inputs, ["focus", "slug"]), outputs: keep(step.outputs, ["scored", "chosen", "fallback"]) };
  return { inputs: {}, outputs: {} };
}

// ---------------------------------------------------------------------------
// Recording
// ---------------------------------------------------------------------------

/**
 * A LoopObserver that keeps every span in memory, timed against `now()`
 * (Date.now by default, the clock Jev's step times use), already sanitised.
 */
export class RecordingObserver implements LoopObserver {
  readonly spans: ReplaySpan[] = [];
  private readonly t0: number;
  private rounds = 0;

  constructor(private readonly now: () => number = Date.now) {
    this.t0 = now();
    this.spans.push({ id: 0, parent: null, name: "copilot-chat", kind: "chain", start: 0, end: 0, inputs: {}, outputs: {} });
  }

  private open(name: string, kind: SpanKind, inputs: KV, finish: (outputs: KV | undefined) => KV): TraceSpan {
    const span: ReplaySpan = { id: this.spans.length, parent: 0, name, kind, start: this.now() - this.t0, end: -1, inputs, outputs: {} };
    this.spans.push(span);
    let ended = false;
    const close = (outputs: KV | undefined, error?: string) => {
      if (ended) return;
      ended = true;
      span.end = this.now() - this.t0;
      span.outputs = finish(outputs);
      if (error) span.error = error;
    };
    return {
      annotate: () => {},
      step: (stepName, step) => {
        const { inputs: si, outputs: so } = sanitizeStep(stepName, step);
        this.spans.push({
          id: this.spans.length,
          parent: span.id,
          name: stepName,
          kind: "jev",
          start: step.startTime - this.t0,
          end: step.endTime - this.t0,
          inputs: si,
          outputs: so,
          ...(step.error && { error: step.error }),
        });
      },
      end: (outputs) => close(outputs),
      fail: (err) => close(undefined, err instanceof Error ? err.message : String(err)),
    };
  }

  roundStart(round: number, input: unknown, offered: string[]): TraceSpan {
    this.rounds++;
    return this.open(`gpt round ${round + 1}`, "llm", sanitizeRoundInput(round, input, offered), sanitizeRoundOutput);
  }

  toolStart(call: FunctionCall): TraceSpan {
    const args = parseArgs(call.arguments);
    return this.open(call.name, "tool", isObj(args) ? args : { arguments: args }, (o) => sanitizeToolResult(call.name, o?.result));
  }

  /** Closes the root and returns spans ordered by start (ties: parents first), with ids renumbered to match. */
  finish(outputs: KV): { spans: ReplaySpan[]; totalMs: number } {
    const totalMs = this.now() - this.t0;
    const root = this.spans[0];
    root.end = totalMs;
    root.outputs = outputs;
    const open = this.spans.filter((s) => s.end < 0);
    if (open.length) throw new Error(`recording: spans never ended: ${open.map((s) => s.name).join(", ")}`);
    const ordered = [...this.spans].sort((a, b) => a.start - b.start || a.id - b.id);
    const remap = new Map(ordered.map((s, i) => [s.id, i]));
    return {
      totalMs,
      spans: ordered.map((s) => ({ ...s, id: remap.get(s.id)!, parent: s.parent === null ? null : remap.get(s.parent)! })),
    };
  }
}

/** A recording is unusable if the loop retried or anything errored: re-run it. */
export function recordingProblems(spans: ReplaySpan[]): string[] {
  const problems: string[] = [];
  for (const s of spans) {
    if (s.name.startsWith("retry")) problems.push(`retry span: ${s.name}`);
    if (s.error) problems.push(`${s.name} failed: ${s.error}`);
    const err = s.outputs.error;
    if (typeof err === "string") problems.push(`${s.name} returned an error: ${err}`);
  }
  return problems;
}
