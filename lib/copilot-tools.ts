import { PAGE_TARGET_IDS } from "@/lib/profile";
import { MAX_ARTICLES_PER_REPLY, MAX_TOPICS } from "@/lib/search-config";
import { ARTICLES, type Article } from "@/lib/articles";
import {
  PAGE_SIZE,
  searchMyWriting,
  type FoundArticle,
  type SearchOptions,
  type SearchTrace,
} from "@/lib/writing-search";
import type { TraceSpan } from "@/lib/copilot-loop";
import { mediumPostId, publishedDate, type PriorCitation } from "@/lib/citation-ledger";
import { pickSections, type PickInput, type PickOptions, type PickedArticle, type SectionTrace } from "@/lib/section-pick";

// ---------------------------------------------------------------------------
// Copilot tool registry. The /api/chat loop offers every tool here to the
// model, enforces each tool's per-reply call limit, and relays the events a
// tool emits to the drawer as NDJSON. A tool never touches the response
// stream directly.
// ---------------------------------------------------------------------------

export type CopilotEvent =
  | { type: "action"; target: string }
  /** relevance/score are Jev's for search_writing; null for read_writing, which reads by id without ranking. */
  | { type: "source"; n: number; title: string; url: string; relevance: number | null; score: number | null };

export type Emit = (event: CopilotEvent) => void;

export interface CopilotTool<A = unknown> {
  /** Responses API function-tool definition (strict JSON schema). */
  definition: {
    type: "function";
    name: string;
    description: string;
    strict: true;
    parameters: Record<string, unknown>;
  };
  /** Max calls per reply. Extra calls get an error result and the model carries on. */
  maxCallsPerReply: number;
  /** Validate the model's raw JSON arguments. Return null to reject. Never trust model output. */
  parse(raw: string): A | null;
  /**
   * Do the work, emit drawer events, return what the model sees. `trace` is
   * this call's tracing span (a no-op unless tracing is on); anything put on
   * it goes to the trace only, never to the model.
   */
  run(args: A, ctx: { emit: Emit; signal: AbortSignal; trace?: TraceSpan }): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// show_on_page — a client-side action. The route never touches the DOM; it
// relays a validated target to the browser, which scrolls to and highlights
// that anchor. The enum is generated from lib/profile.ts, so the model can
// only name anchors that actually exist on the page.
// ---------------------------------------------------------------------------

const PAGE_TARGET_SET = new Set<string>(PAGE_TARGET_IDS);

/** Returns the validated target from show_on_page's raw arguments, or null. */
export function parseShowOnPageTarget(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as { target?: unknown } | null;
    const target = parsed?.target;
    return typeof target === "string" && PAGE_TARGET_SET.has(target) ? target : null;
  } catch {
    return null;
  }
}

function createShowOnPageTool(): CopilotTool<string> {
  return {
    definition: {
      type: "function",
      name: "show_on_page",
      description:
        "Scroll the visitor's page to the entry your answer is about and briefly highlight it. Call at most once per answer, before writing the answer.",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          target: {
            type: "string",
            enum: PAGE_TARGET_IDS,
            description: "Anchor id from the Targets list in the system prompt.",
          },
        },
        required: ["target"],
        additionalProperties: false,
      },
    },
    maxCallsPerReply: 1,
    parse: parseShowOnPageTarget,
    async run(target, { emit }) {
      emit({ type: "action", target });
      return { shown: target };
    },
  };
}

// ---------------------------------------------------------------------------
// Reading state shared by search_writing and read_writing, per request:
// numbering is per conversation (an article cited in an earlier reply, the
// `prior` ledger, keeps its number; a new one gets the next free number), each
// article is emitted as a `source` event once per reply, and a reply reads at
// most MAX_ARTICLES_PER_REPLY distinct articles across both tools.
// ---------------------------------------------------------------------------

export const READING_LIMIT_NOTE = "Reading limit for this reply reached; answer from what you have.";

type ServedArticle = { slug: string; title: string; url: string; publishedAt?: string; coAuthors?: string[] };

function createReading(prior: readonly PriorCitation[]) {
  const numbered = new Map<string, number>(prior.map((c) => [c.slug, c.n]));
  let nextN = prior.reduce((max, c) => Math.max(max, c.n), 0) + 1;
  // Articles admitted this reply: reserved synchronously at admission, so tool
  // calls running in parallel (one step) can't each see the full cap.
  const served = new Set<string>();
  // Articles whose footnote has been emitted this reply.
  const emitted = new Set<string>();
  return {
    /** How many more new articles this reply may read. */
    room: () => Math.max(0, MAX_ARTICLES_PER_REPLY - served.size),
    isServed: (slug: string) => served.has(slug),
    /** Keeps already-served articles; admits new ones only while there's room. */
    admit<T extends { slug: string }>(articles: readonly T[]): T[] {
      return articles.filter((a) => {
        if (served.has(a.slug)) return true;
        if (served.size >= MAX_ARTICLES_PER_REPLY) return false;
        served.add(a.slug);
        return true;
      });
    },
    /** Numbers the article, emits its footnote the first time this reply, and returns what the model sees. */
    serve(a: ServedArticle, picked: PickedArticle, emit: Emit, rank: { relevance: number | null; score: number | null }) {
      let n = numbered.get(a.slug);
      if (n === undefined) {
        n = nextN++;
        numbered.set(a.slug, n);
      }
      if (!emitted.has(a.slug)) {
        emitted.add(a.slug);
        emit({ type: "source", n, title: a.title, url: a.url, ...rank });
      }
      return {
        n,
        title: a.title,
        url: a.url,
        ...(a.publishedAt && { published: publishedDate(a.publishedAt) }),
        ...(a.coAuthors?.length && { coAuthors: a.coAuthors }),
        outline: picked.outline,
        sections: picked.sections,
      };
    },
  };
}

type Reading = ReturnType<typeof createReading>;

// ---------------------------------------------------------------------------
// search_writing — finds and reads my own articles (lib/writing-search.ts).
// A search ranks everything that passes, but hands over PAGE_SIZE at a time;
// `more: true` serves the next page from that ranking without asking Jev
// again. Numbering, footnotes and the per-reply cap are the shared Reading state.
// ---------------------------------------------------------------------------

const MAX_QUERY_CHARS = 300;

export type SearchWritingArgs = { topics: string[]; more: boolean };

/**
 * Returns the validated arguments, or null. Topics are trimmed, blanks dropped,
 * deduped case-insensitively (first spelling kept) and capped at MAX_QUERY_CHARS;
 * 0 or more than MAX_TOPICS left → null. A missing `more` means a new search.
 */
export function parseSearchWritingArgs(raw: string): SearchWritingArgs | null {
  try {
    const parsed = JSON.parse(raw) as { topics?: unknown; more?: unknown } | null;
    const topics = parsed?.topics;
    const more = parsed?.more ?? false;
    if (!Array.isArray(topics) || !topics.every((t) => typeof t === "string") || typeof more !== "boolean") return null;
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const t of topics as string[]) {
      const topic = t.trim().slice(0, MAX_QUERY_CHARS);
      const key = topic.toLowerCase();
      if (!topic || seen.has(key)) continue;
      seen.add(key);
      cleaned.push(topic);
    }
    return cleaned.length >= 1 && cleaned.length <= MAX_TOPICS ? { topics: cleaned, more } : null;
  } catch {
    return null;
  }
}

type SearchFn = (query: string, options: SearchOptions) => Promise<FoundArticle[]>;
type PickFn = (article: PickInput, focus: string, options?: PickOptions) => Promise<PickedArticle>;

/** A found article with every topic whose search matched it, in first-match order. */
export type TopicArticle = FoundArticle & { topics: string[] };

/**
 * Round-robin across topics — 1st of each, then 2nd of each — so no topic's
 * articles crowd another's out. An article matched by several topics appears
 * once, at its first position, listing every topic that matched it.
 */
export function mergeByTopic(rankings: { topic: string; found: FoundArticle[] }[]): TopicArticle[] {
  const merged: TopicArticle[] = [];
  const bySlug = new Map<string, TopicArticle>();
  const depth = Math.max(0, ...rankings.map((r) => r.found.length));
  for (let i = 0; i < depth; i++) {
    for (const { topic, found } of rankings) {
      const a = found[i];
      if (!a) continue;
      const existing = bySlug.get(a.slug);
      if (existing) {
        if (!existing.topics.includes(topic)) existing.topics.push(topic);
        continue;
      }
      const entry = { ...a, topics: [topic] };
      bySlug.set(a.slug, entry);
      merged.push(entry);
    }
  }
  return merged;
}

function createSearchWritingTool(search: SearchFn, reading: Reading, pick: PickFn): CopilotTool<SearchWritingArgs> {
  // Per reply: the last search's merged ranking, minus the pages already handed over.
  let pending: TopicArticle[] | null = null;

  // Each served article is read section by section, focused on the topic that found it.
  // Past the reply's reading cap, the page is cut short; nothing left to serve → null.
  const page = async (emit: Emit, signal: AbortSignal, trace?: TraceSpan) => {
    const served = reading.admit(pending!.splice(0, PAGE_SIZE));
    if (served.length === 0) return null;
    const picks = await Promise.all(
      served.map((a) => pick(a, a.topics[0], { signal, onTrace: (t) => recordSectionStep(trace, t) }))
    );
    return {
      articles: served.map((a, i) => ({
        ...reading.serve(a, picks[i], emit, { relevance: a.relevance, score: a.score }),
        topic: a.topics[0],
      })),
      remaining: pending!.length,
      served,
    };
  };

  return {
    definition: {
      type: "function",
      name: "search_writing",
      description:
        "Find and read my own articles, best match first, three at a time. Pass one topic per distinct thing the question asks about (up to 3); each is searched separately. Use before answering anything about my writing or my views on a technical topic. Cite results as [n].",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          topics: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: MAX_TOPICS,
            description:
              "One standalone search per distinct thing asked about, e.g. [\"LiteLLM\", \"Helm charts\", \"Nginx\"]. A single-topic question passes one. Resolve references like 'that one' from the conversation.",
          },
          more: {
            type: "boolean",
            description:
              "true: the next articles from your last search (topics are then ignored). false: a new search.",
          },
        },
        required: ["topics", "more"],
        additionalProperties: false,
      },
    },
    maxCallsPerReply: 2,
    parse: parseSearchWritingArgs,
    async run({ topics, more }, { emit, signal, trace }) {
      if (more && pending) {
        if (pending.length === 0) return { articles: [], note: "No more articles of mine on this." };
        const paged = await page(emit, signal, trace);
        if (!paged) return { articles: [], note: READING_LIMIT_NOTE };
        const { served, ...result } = paged;
        trace?.annotate({ search: { page: "more", chosen: served.map(chosenOf) } });
        return result;
      }
      // Cap already reached: don't spend a Jev search on articles that can't be read.
      if (reading.room() === 0) return { articles: [], note: READING_LIMIT_NOTE };

      const runs = await Promise.all(
        topics.map(async (topic) => {
          let searchTrace: SearchTrace | null = null;
          const found = await search(topic, {
            signal,
            // The log line carries latency and fallbacks only: never the query or article text.
            onTrace: (t) => {
              searchTrace = t;
              console.log(
                JSON.stringify({
                  event: "copilot_writing_search",
                  model: t.model,
                  stage1Ms: t.stage1Ms,
                  stage2Ms: t.stage2Ms,
                  totalMs: t.totalMs,
                  shortlisted: t.shortlist.length,
                  fallback: t.fallback,
                  errors: t.errors,
                })
              );
            },
          });
          return { topic, found, trace: searchTrace as SearchTrace | null };
        })
      );
      for (const r of runs) if (trace && r.trace) recordJevSteps(trace, r.topic, r.trace);

      pending = mergeByTopic(runs);
      if (pending.length === 0) {
        if (trace) annotateSearch(trace, runs, []);
        // A failed search found nothing because it never looked: it must not read as "I haven't written about it".
        if (runs.some((r) => r.trace?.fallback === "stage1_failed")) return { articles: [], error: "search unavailable" };
        return { articles: [], note: "No article of mine covers this." };
      }
      const paged = await page(emit, signal, trace);
      if (!paged) return { articles: [], note: READING_LIMIT_NOTE };
      const { served, ...result } = paged;
      if (trace) annotateSearch(trace, runs, served);
      return result;
    },
  };
}

// ---------------------------------------------------------------------------
// read_writing — reads articles the model chose from the library tree in the
// system prompt, by Medium post id. For abstract or goal-shaped questions,
// where the model reasons over themes instead of searching. Sections are
// picked against `focus`, exactly as search_writing picks them against a topic.
// ---------------------------------------------------------------------------

const MAX_READ_IDS = 3;
/** Medium post ids are 8–16 hex chars; anything longer is junk, cut before it reaches errors or traces. */
const MAX_ID_CHARS = 64;

export type ReadWritingArgs = { articles: string[]; focus: string };

/**
 * Returns the validated arguments, or null. Ids are trimmed and lowercased (a
 * full Medium URL is reduced to its post id), blanks dropped, deduped; 1 to 3
 * must remain. `focus` is trimmed and capped at MAX_QUERY_CHARS; blank → null.
 */
export function parseReadWritingArgs(raw: string): ReadWritingArgs | null {
  try {
    const parsed = JSON.parse(raw) as { articles?: unknown; focus?: unknown } | null;
    const ids = parsed?.articles;
    const focus = parsed?.focus;
    if (!Array.isArray(ids) || !ids.every((x) => typeof x === "string") || typeof focus !== "string") return null;
    const cleaned = [
      ...new Set(
        (ids as string[]).map((x) => {
          const id = x.trim();
          return (mediumPostId(id) ?? id).toLowerCase().slice(0, MAX_ID_CHARS);
        })
      ),
    ].filter(Boolean);
    const f = focus.trim().slice(0, MAX_QUERY_CHARS);
    return cleaned.length >= 1 && cleaned.length <= MAX_READ_IDS && f ? { articles: cleaned, focus: f } : null;
  } catch {
    return null;
  }
}

function createReadWritingTool(catalog: readonly Article[], reading: Reading, pick: PickFn): CopilotTool<ReadWritingArgs> {
  let byId: Map<string, Article> | null = null;
  const lookup = (id: string) => {
    if (!byId) {
      byId = new Map();
      for (const a of catalog) {
        const pid = mediumPostId(a.url);
        if (pid && !byId.has(pid)) byId.set(pid, a);
      }
    }
    return byId.get(id);
  };

  return {
    definition: {
      type: "function",
      name: "read_writing",
      description:
        "Read up to 3 of my articles by id, chosen from the library tree in the system prompt. Use for broad or goal-shaped questions, after reasoning over the themes. Returns the sections most relevant to `focus`. Cite results as [n].",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          articles: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: MAX_READ_IDS,
            description: "Article ids exactly as listed in the library tree (the 12-character code before each title).",
          },
          focus: {
            type: "string",
            description: "What to read them for, as a standalone phrase, e.g. \"making agents production-ready\". Picks which sections come back.",
          },
        },
        required: ["articles", "focus"],
        additionalProperties: false,
      },
    },
    maxCallsPerReply: 2,
    parse: parseReadWritingArgs,
    async run({ articles: ids, focus }, { emit, signal, trace }) {
      const known: Article[] = [];
      const unknown: string[] = [];
      for (const id of ids) {
        const a = lookup(id);
        if (a) known.push(a);
        else unknown.push(id);
      }
      const errors = unknown.map((id) => ({ id, error: "unknown article" as const }));
      if (reading.room() === 0 && !known.some((a) => reading.isServed(a.slug))) {
        return { articles: [], note: READING_LIMIT_NOTE, ...(errors.length > 0 && { errors }) };
      }
      const toRead = reading.admit(known);
      const picks = await Promise.all(toRead.map((a) => pick(a, focus, { signal, onTrace: (t) => recordSectionStep(trace, t) })));
      trace?.annotate({ read: { focus, ids, served: toRead.map((a) => a.slug), unknown } });
      return {
        articles: toRead.map((a, i) => reading.serve(a, picks[i], emit, { relevance: null, score: null })),
        ...(errors.length > 0 && { errors }),
      };
    },
  };
}

const chosenOf = (a: FoundArticle) => ({ slug: a.slug, relevance: a.relevance, score: a.score });

/**
 * One annotation per search call. A single topic keeps the flat shape
 * (fallback, totalMs, errors, chosen); several topics add `topics` and a `perTopic` breakdown.
 */
function annotateSearch(
  trace: TraceSpan,
  runs: { topic: string; trace: SearchTrace | null }[],
  served: FoundArticle[]
): void {
  const traced = runs.filter((r): r is { topic: string; trace: SearchTrace } => r.trace !== null);
  if (traced.length === 0) return;
  const worst = traced.find((r) => r.trace.fallback !== "none")?.trace.fallback ?? "none";
  trace.annotate({
    search: {
      fallback: worst,
      totalMs: Math.max(...traced.map((r) => r.trace.totalMs)),
      errors: traced.flatMap((r) => r.trace.errors),
      chosen: served.map(chosenOf),
      ...(runs.length > 1 && {
        topics: runs.map((r) => r.topic),
        perTopic: traced.map((r) => ({ topic: r.topic, fallback: r.trace.fallback, totalMs: r.trace.totalMs, errors: r.trace.errors })),
      }),
    },
  });
}

/** Jev's section pick for one served article, as a child step of the search_writing span (tracing only). */
function recordSectionStep(trace: TraceSpan | undefined, t: SectionTrace): void {
  if (t.fallback === "short") return; // returned whole, Jev never asked: no decision to show
  trace?.step("jev sections (score)", {
    inputs: { focus: t.focus, slug: t.slug },
    outputs: { scored: t.scored, chosen: t.chosen, fallback: t.fallback },
    startTime: t.startedAt,
    endTime: t.startedAt + t.ms,
  });
}

/** Jev's two stages for one topic's search, as child steps of the search_writing span (tracing only). */
function recordJevSteps(trace: TraceSpan, query: string, t: SearchTrace): void {
  const stage1End = t.startedAt + t.stage1Ms;
  const failed = (stage: SearchTrace["fallback"]) => (t.fallback === stage ? t.errors.join(", ") || stage : undefined);
  trace.step("jev filter (noul)", {
    inputs: { query, articles: t.catalogSize },
    outputs: { model: t.model, shortlist: t.shortlist, ...(t.nearMisses?.length && { nearMisses: t.nearMisses }) },
    startTime: t.startedAt,
    endTime: stage1End,
    error: failed("stage1_failed"),
  });
  if (t.stage2Ms !== null) {
    trace.step("jev rank (score)", {
      inputs: { query, shortlist: t.shortlist.map((r) => r.slug) },
      outputs: { ranked: t.ranked },
      startTime: stage1End,
      endTime: stage1End + t.stage2Ms,
      error: failed("stage2_failed"),
    });
  }
}

/**
 * Built per request, so per-reply state (counters) lives in closures.
 * `prior` is the conversation's citation ledger, already resolved against the corpus.
 */
export function createCopilotTools(
  deps: { search?: SearchFn; prior?: readonly PriorCitation[]; pick?: PickFn; catalog?: readonly Article[] } = {}
): CopilotTool[] {
  const reading = createReading(deps.prior ?? []);
  const pick = deps.pick ?? pickSections;
  return [
    createShowOnPageTool() as CopilotTool,
    createSearchWritingTool(deps.search ?? searchMyWriting, reading, pick) as CopilotTool,
    createReadWritingTool(deps.catalog ?? ARTICLES, reading, pick) as CopilotTool,
  ];
}
