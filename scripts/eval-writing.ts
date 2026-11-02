/**
 * Golden set for search_writing: real Jev + real GPT, no mocks.
 *
 *   npm run eval:writing              # run the set → content/eval-results.json
 *   npm run eval:writing -- --models  # list Jev builds (pin one as TYPESAFE_DEFAULT_MODEL)
 *   npm run eval:writing -- --dry     # print results without writing the file
 *
 * Each question runs twice: once through searchMyWriting directly (retrieval
 * metrics, with the question as the query), and once through the real agent
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
import { createCopilotTools, type CopilotTool } from "../lib/copilot-tools";
import { JEV_MODEL, searchMyWriting, type SearchTrace } from "../lib/writing-search";

const OUT = join(process.cwd(), "content", "eval-results.json");
const AGENT_TIMEOUT_MS = 60_000;

/**
 * Expected articles are matched by title substring (case-insensitive), or by
 * keyword, so the set survives slug changes. "none" rows must retrieve
 * nothing; "no-search" rows must not call search_writing at all.
 */
type Expect =
  | { kind: "articles"; titles?: string[]; keyword?: string }
  | { kind: "none" }
  | { kind: "no-search" };

const GOLDEN: { question: string; expect: Expect }[] = [
  // The n8n multi-agent piece is the one with guardrails (Llama Guard); "Your AI Agent Needs a Bouncer"
  // is about routing messy queries with Jev, so it gets its own question below.
  { question: "How do you approach guardrails for agents?", expect: { kind: "articles", titles: ["multi-agent system with n8n"] } },
  { question: "How do you triage messy, ambiguous user questions in a multi-agent system?", expect: { kind: "articles", titles: ["Needs a Bouncer"] } },
  { question: "Have you written about LoRA?", expect: { kind: "articles", titles: ["How to Train Your LLM"] } },
  { question: "What's RAFT?", expect: { kind: "articles", titles: ["How to RAFT your LLM"] } },
  { question: "What do you think about LiteLLM?", expect: { kind: "articles", titles: ["introduction to LiteLLM"] } },
  { question: "What have you written about blockchain?", expect: { kind: "articles", keyword: "blockchain" } },
  { question: "How do you give agents memory?", expect: { kind: "articles", titles: ["Agent Memory"] } },
  { question: "How do Command and Send work in LangGraph?", expect: { kind: "articles", titles: ["second look at LangGraph"] } },
  { question: "How do you deploy a multi-server app with Helm?", expect: { kind: "articles", titles: ["Helm Charts"] } },
  { question: "Which of your articles explains fine-tuning with Unsloth?", expect: { kind: "articles", titles: ["How to Train Your LLM", "How to RAFT your LLM"] } },
  // The drawer's starter question: needs all three fine-tuning articles, so at least two searches.
  {
    question: "LoRA, RAFT or GRPO: which fine-tuning approach should I use, and when?",
    expect: { kind: "articles", titles: ["Low Rank Adaptation", "How to RAFT your LLM", "GRPO"] },
  },
  { question: "Have you written about Rust?", expect: { kind: "none" } },
  { question: "Have you written about building iOS apps in Swift?", expect: { kind: "none" } },
  { question: "What's your take on Kotlin coroutines?", expect: { kind: "none" } },
  { question: "What did you build at Illumina?", expect: { kind: "no-search" } },
  { question: "Where did you study?", expect: { kind: "no-search" } },
  { question: "What do you do at Mastercard?", expect: { kind: "no-search" } },
];

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

type AgentRun = { searched: boolean; queries: number; sources: { n: number; url: string }[]; text: string };

async function runAgent(openai: OpenAI, systemPrompt: string, question: string): Promise<AgentRun> {
  let queries = 0;
  const tools: CopilotTool[] = createCopilotTools().map((t) =>
    t.definition.name === "search_writing"
      ? { ...t, run: (args, ctx) => (queries++, t.run(args, ctx)) }
      : t
  );
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
    }
  } finally {
    clearTimeout(timer);
  }
  return { searched: queries > 0, queries, sources, text };
}

const URL_RE = /https?:\/\/[^\s)\]>"'`]+/g;
const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, "");

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
  for (const [i, { question, expect }] of GOLDEN.entries()) {
    process.stdout.write(`[${i + 1}/${GOLDEN.length}] ${question}\n`);
    const expected = expectedSlugs(expect, ARTICLES);

    let trace: SearchTrace | null = null;
    const found = await searchMyWriting(question, { onTrace: (t) => (trace = t) });
    const t = trace as SearchTrace | null;
    jevModel ??= t?.model ?? null;
    const shortlist = t?.shortlist.map((s) => s.slug) ?? [];
    const chosen = found.map((a) => a.slug);

    const agent = await runAgent(openai, systemPrompt, question);
    const invented = [...new Set((agent.text.match(URL_RE) ?? []).map(trimUrl))].filter((u) => !allowedUrls.has(u));
    const citedNumbers = [...agent.text.matchAll(/(?<![\w[])\[(\d{1,2})\](?![(\]])/g)].map((m) => Number(m[1]));
    const dangling = [...new Set(citedNumbers.filter((n) => !agent.sources.some((s) => s.n === n)))];

    results.push({
      question,
      expect: expect.kind,
      expected,
      retrieval: {
        shortlist,
        chosen,
        recall: expect.kind === "articles" ? expected.some((s) => shortlist.includes(s)) : null,
        precisionAt2: expect.kind === "articles" && chosen.length ? ratio(chosen.filter((s) => expected.includes(s)).length, chosen.length) : expect.kind === "articles" ? 0 : null,
        abstained: chosen.length === 0,
        totalMs: t?.totalMs ?? null,
        fallback: t?.fallback ?? null,
        errors: t?.errors ?? [],
      },
      agent: {
        searched: agent.searched,
        searches: agent.queries,
        sources: agent.sources.length,
        citations: [...new Set(citedNumbers)].length,
        inventedUrls: invented,
        danglingCitations: dangling,
      },
    });
  }

  const writing = results.filter((r) => r.expect === "articles");
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
    stage1Recall: ratio(writing.filter((r) => r.retrieval.recall).length, writing.length),
    precisionAt2: ratio(
      writing.reduce((sum, r) => sum + (r.retrieval.precisionAt2 ?? 0), 0),
      writing.length
    ),
    abstainAccuracy: ratio(
      none.filter((r) => r.retrieval.abstained && r.agent.sources === 0 && r.agent.citations === 0).length,
      none.length
    ),
    noInvention: ratio(
      results.filter((r) => r.agent.inventedUrls.length === 0 && r.agent.danglingCitations.length === 0).length,
      results.length
    ),
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    fallbacks,
    questionCount: results.length,
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
