/**
 * Golden set for search_writing: real Jev + real GPT, no mocks.
 *
 *   npm run eval:writing              # run the set → content/eval-results.json
 *   npm run eval:writing -- --models  # list Jev builds (pin one as TYPESAFE_DEFAULT_MODEL)
 *   npm run eval:writing -- --dry     # print results without writing the file
 *
 * Each question runs twice: once through searchMyWriting directly (retrieval
 * metrics: each of the row's topics searched separately and merged, as
 * search_writing does, or the question itself), and once through the real agent
 * loop with the real system prompt (tool-call, abstain and no-invention
 * metrics). /colophon reads the output, so commit it only from a real run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { TypeSafeClient } from "@typesafe-ai/sdk";
import { ARTICLES, type Article } from "../lib/articles";
import { buildSystemPrompt } from "../lib/copilot-prompt";
import { copilotStream, MODEL as GPT_MODEL } from "../lib/copilot-loop";
import { createCopilotTools, mergeByTopic, type CopilotTool } from "../lib/copilot-tools";
import { JEV_MODEL, PAGE_SIZE, searchMyWriting, type SearchTrace } from "../lib/writing-search";
import { mediumPostId } from "../lib/citation-ledger";
import type { ShowCardArgs } from "../lib/cards";
import { GOLDEN, countsForRetrieval, expectedCard, expectedPick, retrievalQueries, usedRecord, type Expect } from "./eval-golden";
import type { ShowOnPageArgs } from "../lib/copilot-tools";

const OUT = join(process.cwd(), "content", "eval-results.json");
const AGENT_TIMEOUT_MS = 60_000;

// ---------------------------------------------------------------------------

function expectedSlugs(expect: Expect, corpus: readonly Article[]): string[] {
  if (expect.kind !== "articles") return [];
  const titles = (expect.titles ?? []).map((t) => t.toLowerCase());
  const kw = expect.keyword?.toLowerCase();
  return corpus
    .filter(
      (a) =>
        titles.some((t) => a.title.toLowerCase().includes(t)) ||
        (kw && (a.keywords.some((k) => k.toLowerCase().includes(kw)) || a.title.toLowerCase().includes(kw)))
    )
    .map((a) => a.slug);
}

type CardRun = {
  /** The kind show_card was called with, or null when it wasn't. */
  kind: ShowCardArgs["kind"] | null;
  /** Whether a card reached the stream (built from my data and passed its A2UI check). */
  shown: boolean;
  /** Article ids the model put on the card that aren't one of my articles (dropped before the visitor sees them). */
  inventedIds: string[];
  /** Compare cards: option names the reply's text never mentions. */
  unmentionedOptions: string[];
};

type AgentRun = {
  searched: boolean;
  queries: number;
  reads: number;
  sources: { n: number; url: string }[];
  text: string;
  card: CardRun;
  /** How many articles show_on_page filtered the Writing page to (0: none). */
  picked: number;
  /** show_on_page as the model called it: its targets and the article ids it passed, before any were dropped. */
  showOnPage: { targets: unknown; articles: unknown } | null;
};

async function runAgent(openai: OpenAI, systemPrompt: string, question: string): Promise<AgentRun> {
  let queries = 0;
  let reads = 0;
  let cardArgs: ShowCardArgs | null = null;
  let picked = 0;
  let showOnPage: AgentRun["showOnPage"] = null;
  const tools: CopilotTool[] = createCopilotTools().map((t) =>
    t.definition.name === "show_on_page"
      ? {
          ...t,
          parse: (raw: string) => {
            try {
              const call = JSON.parse(raw) as { targets?: unknown; articles?: unknown };
              showOnPage = { targets: call.targets, articles: call.articles };
            } catch {
              showOnPage = { targets: null, articles: null };
            }
            return t.parse(raw);
          },
          run: (args, ctx) => ((picked = (args as ShowOnPageArgs).articles.length), t.run(args, ctx)),
        }
      : t.definition.name === "search_writing"
      ? { ...t, run: (args, ctx) => (queries++, t.run(args, ctx)) }
      : t.definition.name === "read_writing"
        ? { ...t, run: (args, ctx) => (reads++, t.run(args, ctx)) }
        : t.definition.name === "show_card"
          ? { ...t, run: (args, ctx) => ((cardArgs = args as ShowCardArgs), t.run(args, ctx)) }
          : t
  );
  let cardShown = false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  let text = "";
  const sources: { n: number; url: string }[] = [];
  try {
    const input = [
      { role: "system" as const, content: systemPrompt },
      { role: "user" as const, content: question },
    ];
    for await (const chunk of copilotStream(openai, input, tools, controller.signal)) {
      if (chunk.kind === "text") text += chunk.text;
      else if (chunk.event.type === "source") sources.push({ n: chunk.event.n, url: chunk.event.url });
      else if (chunk.event.type === "card") cardShown = true;
    }
  } finally {
    clearTimeout(timer);
  }
  return { searched: queries + reads > 0, queries, reads, sources, text, card: cardRun(cardArgs, cardShown, text), picked, showOnPage };
}

const KNOWN_IDS = new Set(ARTICLES.map((a) => mediumPostId(a.url)).filter((id): id is string => id !== null));

function cardRun(args: ShowCardArgs | null, shown: boolean, text: string): CardRun {
  if (!args) return { kind: null, shown, inventedIds: [], unmentionedOptions: [] };
  const ids = args.kind === "evidence" ? args.articles : args.options.flatMap((o) => (o.article ? [o.article] : []));
  const reply = text.toLowerCase();
  return {
    kind: args.kind,
    shown,
    inventedIds: ids.filter((id) => !KNOWN_IDS.has(id)),
    unmentionedOptions: args.kind === "compare" ? args.options.map((o) => o.name).filter((n) => !reply.includes(n.toLowerCase())) : [],
  };
}

const URL_RE = /https?:\/\/[^\s)\]>"'`]+/g;
/** Drops trailing sentence punctuation from a matched URL (a loop, not a "+$" regex, to stay linear). */
function trimUrl(u: string): string {
  let end = u.length;
  while (end > 0 && ".,;:!?".includes(u[end - 1])) end--;
  return u.slice(0, end);
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

const ratio = (hits: number, total: number) => (total === 0 ? null : Number((hits / total).toFixed(3)));

// ---------------------------------------------------------------------------

async function listModels() {
  const models = await new TypeSafeClient().models.list();
  for (const m of models) console.log(`${m.name}\t${m.release_date}\t${m.description}`);
  console.log(`\nCurrently using: ${JEV_MODEL}`);
}

async function main() {
  if (process.argv.includes("--models")) return listModels();
  if (ARTICLES.length === 0) throw new Error("content/articles.json is empty. Run `npm run articles:build` first.");
  if (!process.env.OPENAI_API_KEY || !process.env.TYPESAFE_API_KEY) {
    throw new Error("OPENAI_API_KEY and TYPESAFE_API_KEY must be set (.env.local).");
  }

  // Every expectation must point at something real, or the metric is meaningless.
  const unresolved = GOLDEN.filter((g) => g.expect.kind === "articles" && expectedSlugs(g.expect, ARTICLES).length === 0);
  if (unresolved.length) {
    throw new Error(`Golden-set expectations match no article; fix the titles:\n  ${unresolved.map((g) => g.question).join("\n  ")}`);
  }

  const openai = new OpenAI();
  const systemPrompt = buildSystemPrompt(readFileSync(join(process.cwd(), "copilot-system-prompt.md"), "utf-8"));
  // URLs the bot may legitimately write: my articles plus every link already in its prompt.
  const allowedUrls = new Set([...ARTICLES.map((a) => a.url), ...(systemPrompt.match(URL_RE) ?? []).map(trimUrl)]);

  let jevModel: string | null = null;
  const results = [];
  for (const [i, row] of GOLDEN.entries()) {
    const { question, expect } = row;
    process.stdout.write(`[${i + 1}/${GOLDEN.length}] ${question}\n`);
    const expected = expectedSlugs(expect, ARTICLES);
    const expectedUrls = new Set(ARTICLES.filter((a) => expected.includes(a.slug)).map((a) => a.url));

    const runs = await Promise.all(
      retrievalQueries(row).map(async (topic) => {
        let trace: SearchTrace | null = null;
        const found = await searchMyWriting(topic, { onTrace: (tr) => (trace = tr) });
        return { topic, found, trace: trace as SearchTrace | null };
      })
    );
    const traces = runs.map((r) => r.trace).filter((x): x is SearchTrace => x !== null);
    jevModel ??= traces[0]?.model ?? null;
    const shortlist = [...new Set(traces.flatMap((tr) => tr.shortlist.map((s) => s.slug)))];
    // The first page of the merged ranking: what the agent reads before deciding whether to ask for more.
    const chosen = mergeByTopic(runs).slice(0, PAGE_SIZE).map((a) => a.slug);
    const totalMs = traces.length ? Math.max(...traces.map((tr) => tr.totalMs)) : null;
    const fallback = traces.find((tr) => tr.fallback !== "none")?.fallback ?? traces[0]?.fallback ?? null;

    const agent = await runAgent(openai, systemPrompt, question);
    const invented = [...new Set((agent.text.match(URL_RE) ?? []).map(trimUrl))].filter((u) => !allowedUrls.has(u));
    const citedNumbers = [...agent.text.matchAll(/(?<![\w[])\[(\d{1,2})\](?![(\]])/g)].map((m) => Number(m[1]));
    const dangling = [...new Set(citedNumbers.filter((n) => !agent.sources.some((s) => s.n === n)))];

    results.push({
      question,
      expect: expect.kind,
      expected,
      topics: retrievalQueries(row),
      scoredForRetrieval: countsForRetrieval(row),
      retrieval: {
        shortlist,
        chosen,
        recall: expect.kind === "articles" ? expected.some((s) => shortlist.includes(s)) : null,
        precisionAt2: expect.kind === "articles" && chosen.length ? ratio(chosen.filter((s) => expected.includes(s)).length, chosen.length) : expect.kind === "articles" ? 0 : null,
        abstained: chosen.length === 0,
        totalMs,
        fallback,
        errors: traces.flatMap((tr) => tr.errors),
      },
      agent: {
        searched: agent.searched,
        searches: agent.queries,
        reads: agent.reads,
        // Did the agent read (by either tool) at least one expected article?
        readExpected: expect.kind === "articles" ? agent.sources.some((s) => expectedUrls.has(s.url)) : null,
        sources: agent.sources.length,
        citations: [...new Set(citedNumbers)].length,
        inventedUrls: invented,
        danglingCitations: dangling,
        // Experience-with rows: the reply named when and where from my record.
        usedRecord: usedRecord(row, agent.text),
        card: { expected: expectedCard(row), ...agent.card },
        // Questions only about my articles: the Writing page was filtered to them (and not for the others).
        pick: { expected: expectedPick(row), picked: agent.picked, called: agent.showOnPage },
      },
    });
  }

  const writing = results.filter((r) => r.expect === "articles");
  // Abstract rows are answered from the library tree, not one search: end-to-end metrics only.
  const retrievalWriting = writing.filter((r) => r.scoredForRetrieval);
  const none = results.filter((r) => r.expect === "none");
  const noSearch = results.filter((r) => r.expect === "no-search");
  const latencies = results.map((r) => r.retrieval.totalMs).filter((x): x is number => x !== null);
  const fallbacks: Record<string, number> = {};
  for (const r of results) if (r.retrieval.fallback) fallbacks[r.retrieval.fallback] = (fallbacks[r.retrieval.fallback] ?? 0) + 1;

  const metrics = {
    toolCallAccuracy: ratio(
      [...writing, ...none].filter((r) => r.agent.searched).length + noSearch.filter((r) => !r.agent.searched).length,
      results.length
    ),
    stage1Recall: ratio(retrievalWriting.filter((r) => r.retrieval.recall).length, retrievalWriting.length),
    // End to end: the agent read an expected article, through search_writing or read_writing.
    agentRecall: ratio(writing.filter((r) => r.agent.readExpected).length, writing.length),
    precisionAt2: ratio(
      retrievalWriting.reduce((sum, r) => sum + (r.retrieval.precisionAt2 ?? 0), 0),
      retrievalWriting.length
    ),
    abstainAccuracy: ratio(
      none.filter((r) => r.retrieval.abstained && r.agent.sources === 0 && r.agent.citations === 0).length,
      none.length
    ),
    noInvention: ratio(
      results.filter((r) => r.agent.inventedUrls.length === 0 && r.agent.danglingCitations.length === 0).length,
      results.length
    ),
    // Cards: the expected card (or none) was shown; invented article ids are counted (target 0, always dropped).
    cardAccuracy: ratio(
      results.filter((r) => r.agent.card.expected !== null && r.agent.card.shown === (r.agent.card.expected !== "none") && (r.agent.card.expected === "none" || r.agent.card.kind === r.agent.card.expected)).length,
      results.filter((r) => r.agent.card.expected !== null).length
    ),
    cardsShown: results.filter((r) => r.agent.card.shown).length,
    pickAccuracy: ratio(
      results.filter((r) => r.agent.pick.expected !== null && r.agent.pick.expected === r.agent.pick.picked > 0).length,
      results.filter((r) => r.agent.pick.expected !== null).length
    ),
    cardInventedIds: results.reduce((sum, r) => sum + r.agent.card.inventedIds.length, 0),
    compareOptionsUnmentioned: results.reduce((sum, r) => sum + r.agent.card.unmentionedOptions.length, 0),
    recordAccuracy: ratio(
      results.filter((r) => r.agent.usedRecord === true).length,
      results.filter((r) => r.agent.usedRecord !== null).length
    ),
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    fallbacks,
    questionCount: results.length,
    // Precision is measured on the first page; the scorecard labels it with this.
    pageSize: PAGE_SIZE,
  };

  const output = { runAt: new Date().toISOString(), model: { jev: jevModel, gpt: GPT_MODEL }, questions: results, metrics };
  console.log(JSON.stringify(metrics, null, 2));
  if (process.argv.includes("--dry")) return;
  writeFileSync(OUT, JSON.stringify(output, null, 2) + "\n");
  console.log(`\n✓ Wrote content/eval-results.json`);
}

main().catch((err) => {
  console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
