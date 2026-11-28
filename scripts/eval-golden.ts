/**
 * The golden set for `npm run eval:writing`, on its own so it's testable
 * without API keys. Expected articles are matched by title substring
 * (case-insensitive), or by keyword, so the set survives slug changes.
 * "none" rows must retrieve nothing; "no-search" rows must not call a writing
 * tool (search_writing or read_writing) at all.
 */
export type Expect =
  | { kind: "articles"; titles?: string[]; keyword?: string }
  | { kind: "none" }
  | { kind: "no-search" };

export type GoldenRow = {
  question: string;
  expect: Expect;
  /** The retrieval pass searches each of these separately and merges them, as search_writing does; default: the question. */
  topics?: string[];
  /** false: an abstract question answered from the library tree, scored end to end only (not in recall or precision). */
  retrieval?: false;
  /**
   * Experience-with rows: words from my record (lib/about.ts, lib/profile.ts) the reply must contain, case-insensitive.
   * "SMU|MITB" accepts either: the same place under two names.
   */
  record?: string[];
  /** The card the reply should carry (show_card). Unset: no-search and none rows expect no card; others aren't scored. */
  card?: CardExpect;
  /**
   * Whether show_on_page should filter the Writing page to articles (questions only about my articles do; answers
   * that span the site don't). Unset: not scored.
   */
  pick?: boolean;
  /** Asked by voice: runs with the spoken-reply rules added, as /api/chat does, and its reply is checked by spokenStyleProblems. */
  spoken?: true;
};

export type CardExpect = "evidence" | "compare" | "none";

const PRODUCTION_AGENTS = ["Testing RAG Agents", "Agent Memory", "Needs a Bouncer", "introduction to LiteLLM"];

export const GOLDEN: GoldenRow[] = [
  // The n8n multi-agent piece is the one with guardrails (Llama Guard); "Your AI Agent Needs a Bouncer"
  // is about routing messy queries with Jev, so it gets its own question below.
  { question: "How do you approach guardrails for agents?", expect: { kind: "articles", titles: ["multi-agent system with n8n"] } },
  { question: "How do you triage messy, ambiguous user questions in a multi-agent system?", expect: { kind: "articles", titles: ["Needs a Bouncer"] } },
  { question: "Have you written about LoRA?", expect: { kind: "articles", titles: ["How to Train Your LLM"] } },
  { question: "What's RAFT?", expect: { kind: "articles", titles: ["How to RAFT your LLM"] } },
  { question: "What do you think about LiteLLM?", expect: { kind: "articles", titles: ["introduction to LiteLLM"] } },
  // Only about my articles: the Writing page is filtered to them, and no card.
  { question: "What have you written about blockchain?", expect: { kind: "articles", keyword: "blockchain" }, card: "none", pick: true },
  { question: "How do you give agents memory?", expect: { kind: "articles", titles: ["Agent Memory"] } },
  { question: "How do Command and Send work in LangGraph?", expect: { kind: "articles", titles: ["second look at LangGraph"] } },
  { question: "How do you deploy a multi-server app with Helm?", expect: { kind: "articles", titles: ["Helm Charts"] } },
  { question: "Which of your articles explains fine-tuning with Unsloth?", expect: { kind: "articles", titles: ["How to Train Your LLM", "How to RAFT your LLM"] } },
  // The drawer's starter question: needs all three fine-tuning articles, so at least two searches.
  {
    question: "LoRA, RAFT or GRPO: which fine-tuning approach should I use, and when?",
    expect: { kind: "articles", titles: ["Low Rank Adaptation", "How to RAFT your LLM", "GRPO"] },
    card: "compare",
  },
  // Multi-part: each part is its own topic, so Nginx isn't crowded out (the original miss).
  {
    question: "How would I use LiteLLM, Helm and Nginx to put agents in production?",
    expect: { kind: "articles", titles: ["introduction to LiteLLM", "Helm Charts", "Nginx"] },
    topics: ["LiteLLM", "Helm charts", "Nginx"],
  },
  // Abstract and goal-shaped: answered by reasoning over the library tree, then read_writing.
  // Spans the site (roles, projects and articles): the evidence card, and no filter.
  {
    question: "How would you design production-ready agents?",
    expect: { kind: "articles", titles: PRODUCTION_AGENTS },
    retrieval: false,
    card: "evidence",
    pick: false,
  },
  // Only about my articles (a starter question): the Writing page is filtered to them, and no card.
  {
    question: "Which of your articles should I read to build production-ready agents?",
    expect: { kind: "articles", titles: PRODUCTION_AGENTS },
    retrieval: false,
    card: "none",
    pick: true,
  },
  // Experience-with: the record first (when, where), then the article that backs it.
  {
    question: "Tell me about your experience with knowledge graphs.",
    expect: { kind: "articles", titles: ["GraphRAG for the win"] },
    topics: ["knowledge graphs"],
    record: ["Illumina", "TigerGraph", "Neo4j"],
  },
  { question: "What's your experience with Java?", expect: { kind: "articles", titles: ["LangChain4j"] }, topics: ["Java"], record: ["UOB"] },
  // Computer vision sits in Illumina's copilot notes, SMU's results and earlier projects, not in a role's headline.
  {
    question: "Have you worked on computer vision use cases?",
    expect: { kind: "articles", titles: ["Multimodal RAG"] },
    topics: ["computer vision"],
    record: ["Illumina", "SMU|MITB|Singapore Management University"],
  },
  { question: "Have you used Helm?", expect: { kind: "articles", titles: ["Helm Charts"] }, topics: ["Helm"], record: ["Illumina"] },
  { question: "Have you written about Rust?", expect: { kind: "none" } },
  { question: "Have you written about building iOS apps in Swift?", expect: { kind: "none" } },
  { question: "What's your take on Kotlin coroutines?", expect: { kind: "none" } },
  { question: "What did you build at Illumina?", expect: { kind: "no-search" } },
  { question: "Where did you study?", expect: { kind: "no-search" } },
  { question: "What do you do at Mastercard?", expect: { kind: "no-search" } },
  // Evaluative: evidence from the record in the prompt, never a search.
  { question: "How do you stand out against other candidates?", expect: { kind: "no-search" } },
  // Asked by voice: the reply is also read aloud, so it must be plain sentences (spokenStyleProblems; reported, never failing).
  { question: "Tell me about your time at Illumina.", expect: { kind: "no-search" }, spoken: true },
  { question: "What did you write about GRPO?", expect: { kind: "articles", titles: ["GRPO"] }, card: "none", pick: true, spoken: true },
  { question: "What is fictional-bassoon?", expect: { kind: "no-search" }, spoken: true },
];

/** What the retrieval pass searches: one query per topic, or the question itself. */
export const retrievalQueries = (row: GoldenRow): string[] => row.topics ?? [row.question];

/** The row's record words the reply leaves out (any one name of a "a|b" entry counts), or null when it has none. */
export const missingRecord = (row: GoldenRow, reply: string): string[] | null => {
  if (!row.record) return null;
  const text = reply.toLowerCase();
  return row.record.filter((w) => !w.split("|").some((name) => text.includes(name.toLowerCase())));
};

/** Whether `reply` names every word of the row's record, or null when the row has none. */
export const usedRecord = (row: GoldenRow, reply: string): boolean | null => {
  const missing = missingRecord(row, reply);
  return missing === null ? null : missing.length === 0;
};

/** Whether the row counts toward the retrieval-only metrics (recall, precision, abstain). */
export const countsForRetrieval = (row: GoldenRow): boolean => row.retrieval !== false;

/** Whether a row expects the Writing page filtered to articles; null when not scored. */
export const expectedPick = (row: GoldenRow): boolean | null => row.pick ?? null;

/** The card a row expects: its own `card`, else none for rows that shouldn't search; null when not scored. */
export const expectedCard = (row: GoldenRow): CardExpect | null =>
  row.card ?? (row.expect.kind === "none" || row.expect.kind === "no-search" ? "none" : null);

/**
 * What in a reply would sound wrong read aloud: a list, a heading, bold, a URL, or more than two paragraphs.
 * `[n]` citations are fine (shown, not spoken). Empty when the reply is clean.
 */
export const spokenStyleProblems = (reply: string): string[] => {
  const problems: string[] = [];
  if (/^\s*(?:[-*+•]|\d+[.)])\s/m.test(reply)) problems.push("list");
  if (/^\s{0,3}#{1,6}\s/m.test(reply)) problems.push("heading");
  if (/\*\*|__/.test(reply)) problems.push("bold");
  if (/https?:\/\/|www\./i.test(reply)) problems.push("url");
  if (reply.split(/\n\s*\n/).filter((p) => p.trim() !== "").length > 2) problems.push("more than two paragraphs");
  return problems;
};
