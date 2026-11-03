import { TypeSafeClient, noul, score } from "@typesafe-ai/sdk";
import { ARTICLES, type Article } from "@/lib/articles";
import { MIN_SCORE, RELEVANT } from "@/lib/search-config";

// ---------------------------------------------------------------------------
// Searching my writing with Jev (TypeSafe AI). Two stages, no embeddings:
//   1. filter — one `noul` per article on its card (title, summary, keywords):
//      an independent "relevant?" probability, so many (or none) can pass.
//   2. rank — one graded `score` per shortlisted article, on more than the
//      card (outline + intro), which is what earns the second pass its latency.
// Returns the whole ranking, best first; search_writing pages through it
// PAGE_SIZE at a time, so the agent decides how much it reads.
// Fails open: stage 2 down → stage-1 order; stage 1 down → []. Retrieval
// problems never break chat. SERVER ONLY (imports every article body).
// ---------------------------------------------------------------------------

/**
 * Jev build. Pin a dated build (list them with `npm run eval:writing -- --models`)
 * so golden-set results stay comparable across runs.
 */
export const JEV_MODEL = process.env.TYPESAFE_DEFAULT_MODEL ?? "jev-latest";

export { MIN_SCORE, PAGE_SIZE, RELEVANT } from "@/lib/search-config";
export const MAX_BODY_CHARS = 12_000;

/**
 * One shared deadline for both stages. GPT's rounds, not Jev, set the reply's pace,
 * so this is generous: a timed-out search reads no articles at all.
 */
export const SEARCH_BUDGET_MS = 4_000;
/**
 * Stage 1 per attempt. Healthy calls take ~0.4s; a slow one stalls past any limit
 * (seen at 1s and 2.5s alike), so cut it early and retry once rather than wait.
 * Worst case: two attempts plus a 50ms backoff ≈ 2.05s, leaving stage 2 ~2s of the budget.
 * A server Retry-After is ignored: the SDK would otherwise sleep up to 60s, past any budget.
 */
export const STAGE1_ATTEMPT_MS = 1_000;
const STAGE1_RETRY = { maxRetries: 1, backoffInitialMs: 50, backoffJitter: 0, respectRetryAfter: false } as const;
/** Below this much remaining budget, stage 2 isn't worth starting. */
const MIN_STAGE2_MS = 200;

/**
 * Graded per part: a query comparing several topics is answered by several
 * articles, one topic each, and none answers the whole comparison alone.
 */
export const RUBRIC = [
  "Doesn't help answer the query.",
  "Touches the topic in passing.",
  "Covers the query, or one of the topics it asks about, substantially.",
  "Directly answers the query, or one of its parts.",
] as const;

export type FoundArticle = {
  slug: string;
  title: string;
  url: string;
  /** Set on joint articles: who I co-wrote it with. */
  coAuthors?: string[];
  /** Article body, ≤ MAX_BODY_CHARS. */
  body: string;
  /** Stage-1 probability. */
  relevance: number;
  /** Stage-2 expected score, or null if stage 2 was skipped or failed. */
  score: number | null;
};

export type SearchFallback = "none" | "single" | "stage2_failed" | "stage1_failed";

/** What happened inside one search. Contains no article or visitor text, so it is safe to log. */
export type SearchTrace = {
  /** Epoch ms when the search began (stage 1 starts here; stage 2 follows it). */
  startedAt: number;
  /** Articles stage 1 judged. */
  catalogSize: number;
  model: string | null;
  /** Stage-1 shortlist, best first (slugs and probabilities only). */
  shortlist: { slug: string; relevance: number }[];
  /** Stage-2 expected score for every shortlisted slug, including those under MIN_SCORE (null = no valid score). */
  ranked: { slug: string; score: number | null }[];
  stage1Ms: number;
  stage2Ms: number | null;
  totalMs: number;
  fallback: SearchFallback;
  /** Error class names, never messages (which can echo request content). */
  errors: string[];
};

export type SearchOptions = {
  signal?: AbortSignal;
  /** Injected in tests and scripts; defaults to a lazily built client. */
  client?: Pick<TypeSafeClient, "systemOne">;
  /** Injected in tests; defaults to the generated corpus. */
  catalog?: readonly Article[];
  onTrace?: (trace: SearchTrace) => void;
};

let defaultClient: TypeSafeClient | null = null;

/** Reads TYPESAFE_API_KEY. Server-only: never set dangerouslyAllowBrowser. */
function getClient(): TypeSafeClient {
  defaultClient ??= new TypeSafeClient({ defaultModel: JEV_MODEL });
  return defaultClient;
}

const isProbability = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1;
const isScore = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= RUBRIC.length - 1;
const errorName = (err: unknown) => (err instanceof Error ? err.name || err.constructor.name : typeof err);

/**
 * Finds my articles for an agent-written, standalone query: every one that
 * passed, best first. The caller pages through it. May return [].
 */
export async function searchMyWriting(query: string, options: SearchOptions = {}): Promise<FoundArticle[]> {
  const { signal, onTrace } = options;
  const catalog = options.catalog ?? ARTICLES;
  const startedAt = Date.now();
  const deadline = startedAt + SEARCH_BUDGET_MS;
  const trace: SearchTrace = {
    startedAt,
    catalogSize: catalog.length,
    model: null,
    shortlist: [],
    ranked: [],
    stage1Ms: 0,
    stage2Ms: null,
    totalMs: 0,
    fallback: "none",
    errors: [],
  };
  const finish = (found: FoundArticle[]) => {
    trace.totalMs = Date.now() - startedAt;
    onTrace?.(trace);
    return found;
  };

  if (catalog.length === 0) return finish([]);
  const bySlug = new Map(catalog.map((a) => [a.slug, a]));
  const toFound = (slug: string, relevance: number, s: number | null): FoundArticle => {
    const a = bySlug.get(slug)!;
    return {
      slug,
      title: a.title,
      url: a.url,
      ...(a.coAuthors?.length && { coAuthors: a.coAuthors }),
      body: a.body.slice(0, MAX_BODY_CHARS),
      relevance,
      score: s,
    };
  };

  // Written by the agent: standalone, references already resolved.
  const state = { query };

  // ---- Stage 1: filter -----------------------------------------------------
  let shortlist: { slug: string; relevance: number }[];
  try {
    const client = options.client ?? getClient();
    const filter = await client.systemOne(
      {
        state,
        questions: Object.fromEntries(
          catalog.map((a) => [
            a.slug,
            noul({
              task: "Is this article of mine relevant to the search query?",
              article: { title: a.title, summary: a.summary, keywords: a.keywords },
            }),
          ])
        ),
      },
      { timeout: STAGE1_ATTEMPT_MS, retry: STAGE1_RETRY, signal }
    );
    trace.model = filter.model ?? null;
    const answers = (filter.answers ?? {}) as Record<string, { noul?: unknown } | undefined>;
    // Iterating the catalog (not the answers) ignores answers for unknown slugs.
    shortlist = catalog
      .map((a) => ({ slug: a.slug, relevance: answers[a.slug]?.noul }))
      .filter((r): r is { slug: string; relevance: number } => isProbability(r.relevance) && r.relevance >= RELEVANT)
      .sort((x, y) => y.relevance - x.relevance);
  } catch (err) {
    trace.errors.push(errorName(err));
    trace.fallback = "stage1_failed";
    trace.stage1Ms = Date.now() - startedAt;
    return finish([]);
  }
  trace.stage1Ms = Date.now() - startedAt;
  trace.shortlist = shortlist;

  // An empty shortlist means "I haven't written about that": abstaining as a number.
  if (shortlist.length === 0) return finish([]);
  if (shortlist.length === 1) {
    trace.fallback = "single";
    return finish([toFound(shortlist[0].slug, shortlist[0].relevance, null)]);
  }

  const stage1Order = () => shortlist.map((r) => toFound(r.slug, r.relevance, null));
  const remaining = deadline - Date.now();
  if (remaining < MIN_STAGE2_MS) {
    trace.errors.push("BudgetExhausted");
    trace.fallback = "stage2_failed";
    return finish(stage1Order());
  }

  // ---- Stage 2: rank -------------------------------------------------------
  const stage2Start = Date.now();
  try {
    const client = options.client ?? getClient();
    const rank = await client.systemOne(
      {
        state,
        questions: Object.fromEntries(
          shortlist.map(({ slug }) => {
            const a = bySlug.get(slug)!;
            return [
              slug,
              score(
                {
                  task: "How well does this article of mine answer the search query, or one distinct part of it?",
                  article: { title: a.title, summary: a.summary, outline: a.outline, intro: a.intro },
                },
                RUBRIC
              ),
            ];
          })
        ),
      },
      { timeout: remaining, retry: { maxRetries: 0 }, signal }
    );
    trace.stage2Ms = Date.now() - stage2Start;
    const answers = (rank.answers ?? {}) as Record<string, { score?: unknown } | undefined>;
    const scored = shortlist.map((r) => {
      const s = answers[r.slug]?.score;
      return { ...r, score: isScore(s) ? s : null };
    });
    trace.ranked = scored.map(({ slug, score: s }) => ({ slug, score: s }));
    // No usable score at all is a broken answer, not "nothing relevant".
    if (scored.every((r) => r.score === null)) {
      trace.errors.push("NoValidScores");
      trace.fallback = "stage2_failed";
      return finish(stage1Order());
    }
    return finish(
      scored
        .filter((r): r is { slug: string; relevance: number; score: number } => r.score !== null && r.score >= MIN_SCORE)
        .sort((x, y) => y.score - x.score)
        .map((r) => toFound(r.slug, r.relevance, r.score))
    );
  } catch (err) {
    trace.stage2Ms = Date.now() - stage2Start;
    trace.errors.push(errorName(err));
    trace.fallback = "stage2_failed";
    return finish(stage1Order());
  }
}
