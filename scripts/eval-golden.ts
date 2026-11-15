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
};

const PRODUCTION_AGENTS = ["Testing RAG Agents", "Agent Memory", "Needs a Bouncer", "introduction to LiteLLM"];

export const GOLDEN: GoldenRow[] = [
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
  // Multi-part: each part is its own topic, so Nginx isn't crowded out (the original miss).
  {
    question: "How would I use LiteLLM, Helm and Nginx to put agents in production?",
    expect: { kind: "articles", titles: ["introduction to LiteLLM", "Helm Charts", "Nginx"] },
    topics: ["LiteLLM", "Helm charts", "Nginx"],
  },
  // Abstract and goal-shaped: answered by reasoning over the library tree, then read_writing.
  { question: "How would you design production-ready agents?", expect: { kind: "articles", titles: PRODUCTION_AGENTS }, retrieval: false },
  {
    question: "Which of your articles should I read to build production-ready agents?",
    expect: { kind: "articles", titles: PRODUCTION_AGENTS },
    retrieval: false,
  },
  { question: "Have you written about Rust?", expect: { kind: "none" } },
  { question: "Have you written about building iOS apps in Swift?", expect: { kind: "none" } },
  { question: "What's your take on Kotlin coroutines?", expect: { kind: "none" } },
  { question: "What did you build at Illumina?", expect: { kind: "no-search" } },
  { question: "Where did you study?", expect: { kind: "no-search" } },
  { question: "What do you do at Mastercard?", expect: { kind: "no-search" } },
  // Evaluative: evidence from the record in the prompt, never a search.
  { question: "How do you stand out against other candidates?", expect: { kind: "no-search" } },
];

/** What the retrieval pass searches: one query per topic, or the question itself. */
export const retrievalQueries = (row: GoldenRow): string[] => row.topics ?? [row.question];

/** Whether the row counts toward the retrieval-only metrics (recall, precision, abstain). */
export const countsForRetrieval = (row: GoldenRow): boolean => row.retrieval !== false;
