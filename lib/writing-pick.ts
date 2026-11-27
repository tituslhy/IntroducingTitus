// ---------------------------------------------------------------------------
// A pick: the Writing page filtered to the articles an Ask Titus answer is
// about, across desks and years, in the answer's order. It lives in the link
// (/writing?read=id,id), so the back button works and the page can be shared.
// The question that made it is kept in memory only, never in the link: a
// shared link can't put words on my page, only real articles.
// ---------------------------------------------------------------------------

export const PICK_PARAM = "read";
/** Most articles one pick holds (as show_on_page allows). */
export const MAX_PICK = 12;
const POST_ID = /^[0-9a-f]{8,16}$/;

/** "/writing?read=a,b": the Writing page filtered to these articles (Medium post ids). */
export function pickHref(ids: readonly string[]): string {
  return `/writing?${PICK_PARAM}=${ids.join(",")}`;
}

/** The pick in a query string's `read` value: well-formed post ids only, repeats dropped, at most MAX_PICK. */
export function parsePick(value: string | null | undefined): string[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => POST_ID.test(s));
  return [...new Set(ids)].slice(0, MAX_PICK);
}

/** Checks a streamed `pick` event: its post ids, or null when none is well formed. */
export function toPick(event: { articles?: unknown }): string[] | null {
  if (!Array.isArray(event.articles)) return null;
  const ids = parsePick(event.articles.filter((x): x is string => typeof x === "string").join(","));
  return ids.length > 0 ? ids : null;
}

let lastQuestion: { key: string; question: string } | null = null;

/** Remembers which question made this pick, for the page's banner (this visit only). */
export function rememberPickQuestion(ids: readonly string[], question: string): void {
  const q = question.replace(/\s+/g, " ").trim().slice(0, 200);
  lastQuestion = q ? { key: ids.join(","), question: q } : null;
}

/** The question that made this pick in this visit, if it was the last one; null for a shared link. */
export function pickQuestion(ids: readonly string[]): string | null {
  return lastQuestion && lastQuestion.key === ids.join(",") ? lastQuestion.question : null;
}
