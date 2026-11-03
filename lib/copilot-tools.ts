import { PAGE_TARGET_IDS } from "@/lib/profile";
import {
  PAGE_SIZE,
  searchMyWriting,
  type FoundArticle,
  type SearchOptions,
  type SearchTrace,
} from "@/lib/writing-search";
import type { TraceSpan } from "@/lib/copilot-loop";

// ---------------------------------------------------------------------------
// Copilot tool registry. The /api/chat loop offers every tool here to the
// model, enforces each tool's per-reply call limit, and relays the events a
// tool emits to the drawer as NDJSON. A tool never touches the response
// stream directly.
// ---------------------------------------------------------------------------

export type CopilotEvent =
  | { type: "action"; target: string }
  | { type: "source"; n: number; title: string; url: string; relevance: number; score: number | null };

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
// search_writing — finds and reads my own articles (lib/writing-search.ts).
// A search ranks everything that passes, but hands over PAGE_SIZE at a time;
// `more: true` serves the next page from that ranking without asking Jev
// again. Results are numbered per reply, continuing across calls, and each new
// article is emitted as a `source` event for the drawer's footnotes.
// ---------------------------------------------------------------------------

const MAX_QUERY_CHARS = 300;

export type SearchWritingArgs = { query: string; more: boolean };

/** Returns the validated arguments, or null. A missing `more` means a new search. */
export function parseSearchWritingArgs(raw: string): SearchWritingArgs | null {
  try {
    const parsed = JSON.parse(raw) as { query?: unknown; more?: unknown } | null;
    const query = parsed?.query;
    const more = parsed?.more ?? false;
    if (typeof query !== "string" || typeof more !== "boolean") return null;
    const trimmed = query.trim().slice(0, MAX_QUERY_CHARS);
    return trimmed ? { query: trimmed, more } : null;
  } catch {
    return null;
  }
}

type SearchFn = (query: string, options: SearchOptions) => Promise<FoundArticle[]>;

function createSearchWritingTool(search: SearchFn): CopilotTool<SearchWritingArgs> {
  // Per reply: the same article found twice keeps its first number.
  const numbered = new Map<string, number>();
  // Per reply: the last search's ranking, minus the pages already handed over.
  let pending: FoundArticle[] | null = null;

  const page = (emit: Emit) => {
    const served = pending!.splice(0, PAGE_SIZE);
    return {
      articles: served.map((a) => {
        let n = numbered.get(a.slug);
        if (n === undefined) {
          n = numbered.size + 1;
          numbered.set(a.slug, n);
          emit({ type: "source", n, title: a.title, url: a.url, relevance: a.relevance, score: a.score });
        }
        return { n, title: a.title, url: a.url, ...(a.coAuthors?.length && { coAuthors: a.coAuthors }), body: a.body };
      }),
      remaining: pending!.length,
      served,
    };
  };

  return {
    definition: {
      type: "function",
      name: "search_writing",
      description:
        "Find and read my own articles on a topic, best match first, two at a time. Use before answering anything about my writing or my views on a technical topic. Cite results as [n].",
      strict: true,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              "A standalone search query. Resolve references like 'that one' from the conversation.",
          },
          more: {
            type: "boolean",
            description:
              "true: the next articles from your last search (query is then ignored). false: a new search.",
          },
        },
        required: ["query", "more"],
        additionalProperties: false,
      },
    },
    maxCallsPerReply: 2,
    parse: parseSearchWritingArgs,
    async run({ query, more }, { emit, signal, trace }) {
      if (more && pending) {
        if (pending.length === 0) return { articles: [], note: "No more articles of mine on this." };
        const { served, ...result } = page(emit);
        trace?.annotate({
          search: { page: "more", chosen: served.map((a) => ({ slug: a.slug, relevance: a.relevance, score: a.score })) },
        });
        return result;
      }

      let searchTrace: SearchTrace | null = null;
      const found = await search(query, {
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
      pending = [...found];
      if (found.length === 0) {
        if (trace && searchTrace) recordSearchSteps(trace, query, searchTrace, []);
        // A failed search found nothing because it never looked: it must not read as "I haven't written about it".
        if ((searchTrace as SearchTrace | null)?.fallback === "stage1_failed") {
          return { articles: [], error: "search unavailable" };
        }
        return { articles: [], note: "No article of mine covers this." };
      }
      const { served, ...result } = page(emit);
      if (trace && searchTrace) recordSearchSteps(trace, query, searchTrace, served);
      return result;
    },
  };
}

/** Jev's two stages as child steps of the search_writing trace span (tracing only). `chosen` is the page served. */
function recordSearchSteps(trace: TraceSpan, query: string, t: SearchTrace, found: FoundArticle[]): void {
  const stage1End = t.startedAt + t.stage1Ms;
  const failed = (stage: SearchTrace["fallback"]) => (t.fallback === stage ? t.errors.join(", ") || stage : undefined);
  trace.step("jev filter (noul)", {
    inputs: { query, articles: t.catalogSize },
    outputs: { model: t.model, shortlist: t.shortlist },
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
  trace.annotate({
    search: {
      fallback: t.fallback,
      totalMs: t.totalMs,
      errors: t.errors,
      chosen: found.map((a) => ({ slug: a.slug, relevance: a.relevance, score: a.score })),
    },
  });
}

/** Built per request, so per-reply state (counters) lives in closures. */
export function createCopilotTools(deps: { search?: SearchFn } = {}): CopilotTool[] {
  return [
    createShowOnPageTool() as CopilotTool,
    createSearchWritingTool(deps.search ?? searchMyWriting) as CopilotTool,
  ];
}
