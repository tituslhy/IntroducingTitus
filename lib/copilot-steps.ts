/**
 * The tool steps Ask Titus shows while a reply is on its way, and the one line they fold into once it arrives.
 * Steps come from the server (`step` events, lib/copilot-loop.ts); the wording is the server's.
 */
export type Step = { id: string; tool: string; label: string; done: boolean };

/** Plain words for the wait before anything real arrives (a reasoning headline or a tool step). */
export const WAITING_WORDS = ["Thinking", "Reasoning", "Considering", "Weighing"];
export const WAITING_WORD_MS = 3_000;

/** Longest headline shown; a longer one is skipped, never cut off. */
export const MAX_HEADLINE_CHARS = 90;

/**
 * The bold title a reasoning summary opens with ("**Looking up the Illumina role**\n\nI need to…"), or null.
 * Only the title is shown: the paragraph under it can restate my instructions, which are never published.
 */
export function summaryHeadline(text: string): string | null {
  const m = text.trimStart().match(/^\*\*([^*\n]+)\*\*/);
  const headline = m?.[1].trim();
  if (!headline || headline.length > MAX_HEADLINE_CHARS) return null;
  return headline;
}

/** Validates a `step` event from the stream; null when anything is missing. */
export function toStep(raw: { id?: unknown; tool?: unknown; label?: unknown; done?: unknown }): Step | null {
  const { id, tool, label, done } = raw;
  if (typeof id !== "string" || typeof tool !== "string" || typeof label !== "string" || typeof done !== "boolean") return null;
  if (!id || !label) return null;
  return { id, tool, label, done };
}

/** Adds a new step, or updates the one with the same id (its finish), keeping the order they started in. */
export function upsertStep(steps: readonly Step[], step: Step): Step[] {
  const i = steps.findIndex((s) => s.id === step.id);
  if (i === -1) return [...steps, step];
  return steps.map((s, j) => (j === i ? step : s));
}

/**
 * The quiet line above a finished reply: "Searched my writing · read 3 articles", or "Read 2 articles"
 * when it only read by id. `articles` is how many sources the reply was sent. Null when there is nothing to say.
 */
export function foldSteps(steps: readonly Step[], articles: number): string | null {
  if (steps.length === 0) return null;
  const searched = steps.some((s) => s.tool === "search_writing");
  const parts: string[] = [];
  if (searched) parts.push("Searched my writing");
  if (articles > 0) parts.push(`${searched ? "read" : "Read"} ${articles} article${articles === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}
