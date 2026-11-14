/**
 * Replays a real visitor conversation (LangSmith run 01a1ca7b-1492-7000-8000-02e0c6ed970b)
 * through the real agent loop — real GPT, real Jev, no mocks — the way the drawer
 * would send it: last 20 messages as history, plus the citation ledger from every
 * reply so far. Then checks the things that went wrong in the original run.
 *
 *   npm run eval:replay
 *
 * Costs ~10 agent turns. Writes nothing: /colophon's scorecard is eval:writing's job.
 * Exit code 1 if any check fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { buildSystemPrompt } from "../lib/copilot-prompt";
import { copilotStream } from "../lib/copilot-loop";
import { createCopilotTools } from "../lib/copilot-tools";
import { collectCitations, type Source } from "../lib/citations";
import { mediumPostId, parseCitations, renderConversationContext, resolveCitations } from "../lib/citation-ledger";
import { FEATURED_ARTICLES } from "../lib/profile";

const TURN_TIMEOUT_MS = 90_000;

/** The visitor's turns, verbatim. The first is reconstructed: the trace's window had already dropped it. */
const TURNS = [
  "What's the most momentous work you've done?",
  "can you tell me more about Illumina's agentic RAG platform?",
  "I see from your website that you also have fictional bassoon and the margin call as projects. what are those?",
  "and how many of these were done in a work setting",
  "I see that you write articles as well and contribute to open-sourced frameworks? I'd say that sets you apart",
  "can you tell me about which of your articles I should read first if I want to build production-ready agents",
  "hmm langserve is archived",
  "ok so which articles should I consult to build production ready agents",
  "LlamaIndex workflows are also no longer state-of-the-art. llamaindex is now mainly focused on LiteParse and LlamaParse - agentic parsing of documents",
  "no...but i see that you've written extensively about genAI agent frameworks, even about nginx and helm charts. why not refer me to those instead?",
  "Based on these articles, can you tell me how I can use LiteLLM, Helm charts and Nginx to make my agents production ready?",
];

/** A compliment, not a question: answered without a search or "I haven't written about that". */
const STATEMENT_TURN = 4;
/** "Which articles should I read first for <goal>": must draw on the featured list. */
const READING_GOAL_TURN = 5;

/** Turns where the visitor corrects the copilot: the reply must not open with an apology or "you're right". */
const CORRECTION_TURNS = new Set([6, 8, 9]);
const CAPITULATION = /^\s*(you['’]re right|fair correction|i apologi[sz]e|sorry|good catch|i shouldn['’]t have)/i;
/** An old article's description of me, stated without a date nearby. */
const STALE_SELF = /(hadn['’]t used helm|kubernetes experience (is|was) limited|limited kubernetes experience)/i;
const DATED = /\b(20\d\d|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\bwhen i wrote\b|\bat the time\b/i;

type Msg = { role: "user" | "assistant"; content: string; sources?: Source[] };

const sentences = (text: string) => text.split(/(?<=[.!?])\s+/);
const citedNumbers = (text: string) =>
  Array.from(text.matchAll(/(?<![\w[])\[(\d{1,2})\](?![(\]])/g), (m) => Number(m[1]));

async function runTurn(openai: OpenAI, systemPrompt: string, messages: Msg[]): Promise<Msg> {
  const history = messages.slice(-20).map(({ role, content }) => ({ role, content }));
  const prior = resolveCitations(parseCitations(collectCitations(messages)) ?? []);
  const input = [
    { role: "system" as const, content: systemPrompt },
    { role: "system" as const, content: renderConversationContext(prior, new Date()) },
    ...history,
  ];
  const tools = createCopilotTools({ prior });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
  let content = "";
  const sources: Source[] = [];
  try {
    for await (const chunk of copilotStream(openai, input, tools, controller.signal)) {
      if (chunk.kind === "text") content += chunk.text;
      else if (chunk.event.type === "source") {
        const { n, title, url } = chunk.event;
        sources.push({ n, title, url });
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return { role: "assistant", content, ...(sources.length > 0 && { sources: sources.sort((a, b) => a.n - b.n) }) };
}

async function main() {
  const openai = new OpenAI();
  const systemPrompt = buildSystemPrompt(readFileSync(join(process.cwd(), "copilot-system-prompt.md"), "utf-8"));
  const messages: Msg[] = [];
  const failures: string[] = [];
  const check = (ok: boolean, label: string) => {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failures.push(label);
  };

  for (const [i, question] of TURNS.entries()) {
    messages.push({ role: "user", content: question });
    const reply = await runTurn(openai, systemPrompt, messages);
    messages.push(reply);
    console.log(`\n── turn ${i}: ${question}\n${reply.content}`);
    for (const s of reply.sources ?? []) console.log(`   [${s.n}] ${s.title}`);
  }

  console.log("\n── checks");

  // 1. One number per article for the whole conversation.
  const byN = new Map<number, Set<string>>();
  const byUrl = new Map<string, Set<number>>();
  for (const s of messages.flatMap((m) => m.sources ?? [])) {
    (byN.get(s.n) ?? byN.set(s.n, new Set()).get(s.n)!).add(s.url);
    (byUrl.get(s.url) ?? byUrl.set(s.url, new Set()).get(s.url)!).add(s.n);
  }
  check([...byN.values()].every((urls) => urls.size === 1), "each number stands for one article all conversation");
  check([...byUrl.values()].every((ns) => ns.size === 1), "each article keeps one number all conversation");

  // 2. Every [n] in a reply is a footnote that reply actually has.
  messages.forEach((m, i) => {
    if (m.role !== "assistant") return;
    const known = new Set((m.sources ?? []).map((s) => s.n));
    const stray = citedNumbers(m.content).filter((n) => !known.has(n));
    if (stray.length) check(false, `turn ${(i - 1) / 2} cites [${stray.join("][")}] with no matching footnote`);
  });

  // 3. Corrections are answered by date, not by capitulation.
  for (const t of CORRECTION_TURNS) {
    const reply = messages[t * 2 + 1].content;
    check(!CAPITULATION.test(reply), `turn ${t} doesn't open with an apology or "you're right"`);
  }

  // 4. A statement isn't searched, and isn't met with "I haven't written about that".
  const statement = messages[STATEMENT_TURN * 2 + 1];
  check(!statement.sources?.length, `turn ${STATEMENT_TURN} (a compliment) doesn't search`);
  check(!/haven['’]t written/i.test(statement.content), `turn ${STATEMENT_TURN} doesn't say "I haven't written about that"`);

  // 5. A reading-for-a-goal question starts from the featured list.
  const featuredIds = new Set(FEATURED_ARTICLES.map((a) => mediumPostId(a.href)));
  const reading = messages[READING_GOAL_TURN * 2 + 1];
  const linked = [
    ...Array.from(reading.content.matchAll(/\]\((https?:[^)\s]+)\)/g), (m) => m[1]),
    ...(reading.sources ?? []).filter((s) => citedNumbers(reading.content).includes(s.n)).map((s) => s.url),
  ];
  check(linked.some((url) => featuredIds.has(mediumPostId(url))), `turn ${READING_GOAL_TURN} recommends at least one featured article`);

  // 6. The final reply cites LiteLLM and Helm, and doesn't present an old self-description as current.
  const final = messages[messages.length - 1];
  const finalTitles = (final.sources ?? []).filter((s) => citedNumbers(final.content).includes(s.n)).map((s) => s.title);
  check(finalTitles.some((t) => /litellm/i.test(t)), "final reply cites the LiteLLM article");
  check(finalTitles.some((t) => /helm/i.test(t)), "final reply cites the Helm article");
  const stale = sentences(final.content).filter((s) => STALE_SELF.test(s) && !DATED.test(s));
  check(stale.length === 0, "final reply doesn't present 'hadn't used Helm' as current");

  console.log(failures.length ? `\n${failures.length} check(s) failed.` : "\nAll checks passed.");
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
