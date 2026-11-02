import { defaultUrlTransform } from "react-markdown";

/** An article footnote, numbered by the server per reply (see search_writing). */
export interface Source {
  n: number;
  title: string;
  url: string;
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
 * `arr[1]`. Adjacent citations (`[1][2]`) are both linked.
 */
export function linkCitations(content: string): string {
  return content
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((part, i) =>
      i % 2 === 1 ? part : part.replace(/(?<![\w[])\[(\d{1,2})\](?![(\]])/g, `[$1](${CITE_SCHEME}$1)`)
    )
    .join("");
}

/** Lets `cite:` through react-markdown's URL sanitiser; everything else keeps the default rules. */
export function citationUrlTransform(url: string): string {
  return url.startsWith(CITE_SCHEME) ? url : defaultUrlTransform(url);
}

/** The source a `cite:n` href points at, or null. */
export function sourceForHref(href: string | undefined, sources: readonly Source[] | undefined): Source | null {
  if (!href?.startsWith(CITE_SCHEME) || !sources) return null;
  const n = Number(href.slice(CITE_SCHEME.length));
  return sources.find((s) => s.n === n) ?? null;
}
