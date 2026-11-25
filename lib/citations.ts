import { defaultUrlTransform } from "react-markdown";

/**
 * An article footnote. The server numbers articles once per conversation (see
 * search_writing), so the same article keeps the same `n` in every reply.
 */
export interface Source {
  n: number;
  title: string;
  url: string;
}

/** What the drawer sends back so the server can keep numbering stable: number and link only. */
export interface CitationRef {
  n: number;
  url: string;
}

/** Most citations the drawer sends, and the server accepts, per request. */
export const MAX_CITATIONS = 40;

/**
 * Every article cited so far in the session, from all messages (not just the
 * ones sent as history), so an early citation keeps its number. First wins:
 * a repeated number or a repeated link is skipped.
 */
export function collectCitations(messages: readonly { sources?: readonly Source[] }[]): CitationRef[] {
  const refs: CitationRef[] = [];
  const seenN = new Set<number>();
  const seenUrl = new Set<string>();
  for (const m of messages) {
    for (const s of m.sources ?? []) {
      if (seenN.has(s.n) || seenUrl.has(s.url)) continue;
      seenN.add(s.n);
      seenUrl.add(s.url);
      refs.push({ n: s.n, url: s.url });
      if (refs.length === MAX_CITATIONS) return refs;
    }
  }
  return refs;
}

/** Validates a streamed `source` event. Only http(s) links are ever rendered. */
export function toSource(event: { n?: unknown; title?: unknown; url?: unknown }): Source | null {
  const { n, title, url } = event;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1) return null;
  if (typeof title !== "string" || !title || typeof url !== "string") return null;
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:" ? { n, title, url } : null;
  } catch {
    return null;
  }
}

export const CITE_SCHEME = "cite:";

/**
 * Turns bare `[n]` markers into `cite:n` links that the Markdown renderer
 * draws as superscript footnotes. Skips code spans and fenced blocks, real
 * Markdown links (`[1](…)`), double brackets (`[[1]]`), and index-like text such as
 * `arr[1]`. Adjacent citations (`[1][2]`) are all linked; every one after the first in a run is marked
 * `cite:,n`, so the drawer draws a comma before it ("1,2,3", not "123").
 */
export function linkCitations(content: string): string {
  return content
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part.replace(/(?<![\w[])((?:\[\d{1,2}\])+)(?![(\]])/g, (run) =>
            (run.match(/\d{1,2}/g) ?? []).map((n, k) => `[${n}](${CITE_SCHEME}${k > 0 ? "," : ""}${n})`).join("")
          )
    )
    .join("");
}

/** True for a citation that follows another in a run (`cite:,n`): the drawer puts a comma before it. */
export function citeFollows(href: string | undefined): boolean {
  return !!href?.startsWith(`${CITE_SCHEME},`);
}

/** Lets `cite:` through react-markdown's URL sanitiser; everything else keeps the default rules. */
export function citationUrlTransform(url: string): string {
  return url.startsWith(CITE_SCHEME) ? url : defaultUrlTransform(url);
}

/** The source a `cite:n` href points at, or null. */
export function sourceForHref(href: string | undefined, sources: readonly Source[] | undefined): Source | null {
  if (!href?.startsWith(CITE_SCHEME) || !sources) return null;
  const n = Number(href.slice(CITE_SCHEME.length).replace(/^,/, ""));
  return sources.find((s) => s.n === n) ?? null;
}
