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

/** The id of the step the drawer adds itself once the page has moved (the server never sends it). */
export const PAGE_MOVE_STEP_ID = "page-move";

/**
 * The step for a page move that really happened, written by the drawer (show_on_page only says where; the
 * page may stay put if the visitor is reading). `stop` is where it went; `samePage` when it only scrolled;
 * `picked` how many articles the Writing page was filtered to (0 for none).
 */
export function pageMoveStep(stop: { page: string; label: string }, samePage: boolean, picked = 0): Step {
  const label =
    picked > 0
      ? `Filtered the Writing page to ${picked} article${picked === 1 ? "" : "s"}`
      : samePage
        ? `Scrolled to ${stop.label}`
        : stop.label === stop.page
          ? `Went to the ${stop.page} page`
          : `Went to ${stop.label} on the ${stop.page} page`;
  return { id: PAGE_MOVE_STEP_ID, tool: "show_on_page", label, done: true };
}

/**
 * The quiet line above a finished reply: "Searched my writing · read 3 articles · went to Mastercard on the
 * Experience page", or "Read 2 articles" when it only read by id. `articles` is how many sources the reply was
 * sent. Null when there is nothing to say.
 */
export function foldSteps(steps: readonly Step[], articles: number): string | null {
  if (steps.length === 0) return null;
  const searched = steps.some((s) => s.tool === "search_writing");
  const parts: string[] = [];
  if (searched) parts.push("Searched my writing");
  if (articles > 0) parts.push(`${searched ? "read" : "Read"} ${articles} article${articles === 1 ? "" : "s"}`);
  const moved = steps.find((s) => s.id === PAGE_MOVE_STEP_ID);
  if (moved) parts.push(parts.length > 0 ? moved.label[0].toLowerCase() + moved.label.slice(1) : moved.label);
  return parts.length > 0 ? parts.join(" · ") : null;
}
