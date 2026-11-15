// ---------------------------------------------------------------------------
// Shared shapes and helpers for the scenario replays (npm run eval:replay).
// A scenario is a scripted visitor conversation plus pure checks over the
// transcript the real agent produced. Pure: no I/O, no API calls, so the
// checks are unit-tested against hand-written transcripts.
// ---------------------------------------------------------------------------

import type { Source } from "../../lib/citations";

export type Check = { label: string; ok: boolean };

/** One message of a replayed conversation. Assistant turns carry their footnotes and the tools they called. */
export type ReplayTurn = { role: "user" | "assistant"; content: string; sources?: Source[]; tools?: string[] };

export type Scenario = {
  name: string;
  /** One line for --list. */
  description: string;
  /** The visitor's turns, in order. */
  turns: string[];
  checks(messages: readonly ReplayTurn[]): Check[];
};

export const WRITING_TOOLS: ReadonlySet<string> = new Set(["search_writing", "read_writing"]);

/** The assistant reply to visitor turn `t` (0-based), in an alternating user/assistant transcript. */
export function replyTo(messages: readonly ReplayTurn[], t: number): ReplayTurn {
  const reply = messages[t * 2 + 1];
  if (!reply || reply.role !== "assistant") throw new Error(`no assistant reply for turn ${t}`);
  return reply;
}

export const assistantTurns = (messages: readonly ReplayTurn[]) =>
  messages.flatMap((m, i) => (m.role === "assistant" ? [{ t: (i - 1) / 2, reply: m }] : []));

/** Inline [n] citations, not Markdown links ([text](url)) or nested brackets. */
export const citedNumbers = (text: string) =>
  Array.from(text.matchAll(/(?<![\w[])\[(\d{1,2})\](?![(\]])/g), (m) => Number(m[1]));

export const sentences = (text: string) => text.split(/(?<=[.!?])\s+/);

export const usedWritingTool = (reply: ReplayTurn) => (reply.tools ?? []).some((name) => WRITING_TOOLS.has(name));

/** Footnotes the reply actually cites inline. */
export const citedSources = (reply: ReplayTurn) => {
  const cited = new Set(citedNumbers(reply.content));
  return (reply.sources ?? []).filter((s) => cited.has(s.n));
};

/** Every footnote from replies before visitor turn `t`. */
export const sourcesBefore = (messages: readonly ReplayTurn[], t: number) =>
  messages.slice(0, t * 2 + 1).flatMap((m) => m.sources ?? []);

export const CAPITULATION = /^\s*(you['’]re right|fair correction|i apologi[sz]e|sorry|good catch|i shouldn['’]t have)/i;

/**
 * Checks every scenario gets: one number per article and one article per
 * number for the whole conversation, and no [n] that stands for no article
 * (neither a footnote of that reply nor one cited earlier in the conversation).
 */
export function conversationChecks(messages: readonly ReplayTurn[]): Check[] {
  const byN = new Map<number, Set<string>>();
  const byUrl = new Map<string, Set<number>>();
  for (const s of messages.flatMap((m) => m.sources ?? [])) {
    if (!byN.has(s.n)) byN.set(s.n, new Set());
    byN.get(s.n)!.add(s.url);
    if (!byUrl.has(s.url)) byUrl.set(s.url, new Set());
    byUrl.get(s.url)!.add(s.n);
  }
  const checks: Check[] = [
    { label: "each number stands for one article all conversation", ok: [...byN.values()].every((urls) => urls.size === 1) },
    { label: "each article keeps one number all conversation", ok: [...byUrl.values()].every((ns) => ns.size === 1) },
  ];
  for (const { t, reply } of assistantTurns(messages)) {
    const known = new Set([...sourcesBefore(messages, t), ...(reply.sources ?? [])].map((s) => s.n));
    const stray = [...new Set(citedNumbers(reply.content).filter((n) => !known.has(n)))];
    if (stray.length) checks.push({ label: `turn ${t} cites [${stray.join("][")}], which stands for no article`, ok: false });
  }
  return checks;
}
