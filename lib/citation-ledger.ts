import { ARTICLES, type Article } from "@/lib/articles";
import { MAX_CITATIONS, type CitationRef } from "@/lib/citations";

// ---------------------------------------------------------------------------
// The conversation's citation ledger. The drawer sends back the number and
// link of every article cited so far; the server resolves each link against
// the corpus and rebuilds title and date itself, so nothing the browser says
// about an article reaches the model. SERVER ONLY (imports every article).
// ---------------------------------------------------------------------------

/** An article already cited in this conversation, under the number it keeps. */
export type PriorCitation = {
  n: number;
  slug: string;
  title: string;
  url: string;
  publishedAt: string;
  coAuthors?: string[];
};

/** Highest footnote number `linkCitations` turns into a link (it matches one or two digits). */
const MAX_CITATION_N = 99;

/**
 * Medium's post id: the hex suffix of the URL path. The same article is
 * reachable as medium.com/@tituslhy/<slug>-<id> and medium.com/<publication>/<slug>-<id>;
 * the id is the one part both share.
 */
export function mediumPostId(url: string): string | null {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname !== "medium.com" && !hostname.endsWith(".medium.com")) return null;
    return pathname.match(/-([0-9a-f]{8,16})\/?$/)?.[1] ?? null;
  } catch {
    return null;
  }
}

/**
 * An article id as the model may write it: the post id itself, a full Medium URL, or a slug ending in the post id
 * ("introducing-stablecoins-1a2b3c4d5e6f"). Lowercased and cut to 64 characters.
 */
export function articleIdOf(raw: string): string {
  const x = raw.trim();
  const id = mediumPostId(x) ?? x.match(/(?:^|-)([0-9a-f]{8,16})\/?$/i)?.[1] ?? x;
  return id.toLowerCase().slice(0, 64);
}

function indexByPostId(catalog: readonly Article[]): Map<string, Article> {
  const byId = new Map<string, Article>();
  for (const a of catalog) {
    const id = mediumPostId(a.url);
    if (id && !byId.has(id)) byId.set(id, a);
  }
  return byId;
}

let defaultIndex: Map<string, Article> | null = null;

/** The corpus article behind a Medium link, in either URL form, or undefined. */
export function articleByUrl(url: string, catalog?: readonly Article[]): Article | undefined {
  const id = mediumPostId(url);
  if (!id) return undefined;
  const index = catalog ? indexByPostId(catalog) : (defaultIndex ??= indexByPostId(ARTICLES));
  return index.get(id);
}

/**
 * Validates the request's `citations` field. Absent → []. Present but
 * malformed (not an array, too long, or an entry that isn't `{ n, url }`) →
 * null, which the route answers with a 400.
 */
export function parseCitations(raw: unknown): CitationRef[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_CITATIONS) return null;
  const refs: CitationRef[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const { n, url } = entry as { n?: unknown; url?: unknown };
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_CITATION_N) return null;
    if (typeof url !== "string" || url.length > 500) return null;
    refs.push({ n, url });
  }
  return refs;
}

/**
 * Resolves refs against the corpus. Unknown links are dropped; on a conflict
 * (a number or an article seen twice) the first wins. Sorted by number.
 */
export function resolveCitations(refs: readonly CitationRef[], catalog?: readonly Article[]): PriorCitation[] {
  const ledger: PriorCitation[] = [];
  const seenN = new Set<number>();
  const seenSlug = new Set<string>();
  for (const { n, url } of refs) {
    const a = articleByUrl(url, catalog);
    if (!a || seenN.has(n) || seenSlug.has(a.slug)) continue;
    seenN.add(n);
    seenSlug.add(a.slug);
    ledger.push({
      n,
      slug: a.slug,
      title: a.title,
      url: a.url,
      publishedAt: a.publishedAt,
      ...(a.coAuthors?.length && { coAuthors: a.coAuthors }),
    });
  }
  return ledger.sort((x, y) => x.n - y.n);
}

/** "2025-06-18T…" → "2025-06-18". The calendar date the article went up, as the corpus records it. */
export function publishedDate(publishedAt: string): string {
  return publishedAt.slice(0, 10);
}

/** "2025-06-18T…" → "18 Jun 2025". */
export function formatPublished(publishedAt: string): string {
  const date = new Date(`${publishedDate(publishedAt)}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return publishedDate(publishedAt);
  return shortMonths(new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date));
}

/** en-GB writes September as "Sept"; every other month is three letters. */
function shortMonths(formatted: string): string {
  return formatted.replace("Sept", "Sep");
}

const AND_LIST = new Intl.ListFormat("en-GB", { style: "long", type: "conjunction" });

/** Today in Singapore, where I am: "14 Nov 2026". */
export function formatToday(now: Date): string {
  return shortMonths(new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Singapore",
  }).format(now));
}

/**
 * The per-request system message that follows the (cached) system prompt:
 * today's date, and the articles already cited with the numbers they keep.
 */
export function renderConversationContext(ledger: readonly PriorCitation[], now: Date): string {
  const lines = [`Today's date: ${formatToday(now)}.`];
  if (ledger.length > 0) {
    lines.push(
      "",
      "Articles of mine already cited in this conversation. Reuse these numbers when you cite them again; search_writing and read_writing return them under the same numbers:",
      ...ledger.map((c) => {
        const by = c.coAuthors?.length ? `, co-written with ${AND_LIST.format(c.coAuthors)}` : "";
        return `[${c.n}] ${c.title} (published ${formatPublished(c.publishedAt)}${by}) ${c.url}`;
      })
    );
  }
  return lines.join("\n");
}
