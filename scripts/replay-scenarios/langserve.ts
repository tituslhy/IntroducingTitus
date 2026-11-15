/**
 * Scenario A: a real visitor conversation (LangSmith run 01a1ca7b-1492-7000-8000-02e0c6ed970b),
 * replayed with checks on the things that went wrong in the original run:
 * shifting footnote numbers, apologising for dated articles, searching a
 * compliment, ignoring the featured list, and missing Nginx in a three-part question.
 */
import { mediumPostId } from "../../lib/citation-ledger";
import { FEATURED_ARTICLES } from "../../lib/profile";
import {
  CAPITULATION,
  assistantTurns,
  citedNumbers,
  citedSources,
  replyTo,
  sentences,
  usedWritingTool,
  type Check,
  type Scenario,
} from "./types";

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
const CORRECTION_TURNS = [6, 8, 9];
/** An old article's description of me, stated without a date nearby. */
const STALE_SELF = /(hadn['’]t used helm|kubernetes experience (is|was) limited|limited kubernetes experience)/i;
/** A real date (a year, or a month with its year) or an explicit "when I wrote it": not words like "may" or "decided". */
export const DATED =
  /\b20\d\d\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+20\d\d\b|\bwhen i wrote\b|\bat the time\b/i;

function checks(messages: Parameters<Scenario["checks"]>[0]): Check[] {
  const out: Check[] = [];

  // Every [n] in a reply is a footnote that reply actually has (this conversation re-searches before citing).
  for (const { t, reply } of assistantTurns(messages)) {
    const known = new Set((reply.sources ?? []).map((s) => s.n));
    const stray = citedNumbers(reply.content).filter((n) => !known.has(n));
    if (stray.length) out.push({ label: `turn ${t} cites [${stray.join("][")}] with no matching footnote`, ok: false });
  }

  // Corrections are answered by date, not by capitulation.
  for (const t of CORRECTION_TURNS) {
    out.push({ label: `turn ${t} doesn't open with an apology or "you're right"`, ok: !CAPITULATION.test(replyTo(messages, t).content) });
  }

  // A statement isn't searched, and isn't met with "I haven't written about that".
  const statement = replyTo(messages, STATEMENT_TURN);
  out.push({ label: `turn ${STATEMENT_TURN} (a compliment) doesn't search`, ok: !usedWritingTool(statement) });
  out.push({ label: `turn ${STATEMENT_TURN} doesn't say "I haven't written about that"`, ok: !/haven['’]t written/i.test(statement.content) });

  // A reading-for-a-goal question starts from the featured list.
  const featuredIds = new Set(FEATURED_ARTICLES.map((a) => mediumPostId(a.href)));
  const reading = replyTo(messages, READING_GOAL_TURN);
  const linked = [
    ...Array.from(reading.content.matchAll(/\]\((https?:[^)\s]+)\)/g), (m) => m[1]),
    ...citedSources(reading).map((s) => s.url),
  ];
  out.push({
    label: `turn ${READING_GOAL_TURN} recommends at least one featured article`,
    ok: linked.some((url) => featuredIds.has(mediumPostId(url))),
  });

  // The final reply cites all three parts, and doesn't present an old self-description as current.
  const final = replyTo(messages, TURNS.length - 1);
  const finalTitles = citedSources(final).map((s) => s.title);
  out.push({ label: "final reply cites the LiteLLM article", ok: finalTitles.some((t) => /litellm/i.test(t)) });
  out.push({ label: "final reply cites the Helm article", ok: finalTitles.some((t) => /helm/i.test(t)) });
  out.push({ label: "final reply cites the Nginx article", ok: finalTitles.some((t) => /nginx/i.test(t)) });
  const stale = sentences(final.content).filter((s) => STALE_SELF.test(s) && !DATED.test(s));
  out.push({ label: "final reply doesn't present 'hadn't used Helm' as current", ok: stale.length === 0 });

  return out;
}

export const langserve: Scenario = {
  name: "langserve",
  description: "the recorded LangServe conversation: corrections, a compliment, featured reading, LiteLLM/Helm/Nginx",
  turns: TURNS,
  checks,
};
