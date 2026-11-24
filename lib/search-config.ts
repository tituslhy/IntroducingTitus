// ---------------------------------------------------------------------------
// The writing search's tuning numbers, on their own so the colophon diagram
// can show them without importing lib/writing-search.ts (and every article
// body with it). One definition: the diagram can't drift from the search.
// ---------------------------------------------------------------------------

/** Stage-1 probability an article must reach to be shortlisted. Tune for recall. */
export const RELEVANT = 0.5;
/** Stage-2 expected score (0–3) a shortlisted article must reach. Tune for precision. */
export const MIN_SCORE = 2.0;
/** Articles search_writing hands the agent per call; it asks for the next page with `more`. */
export const PAGE_SIZE = 3;
/** Characters of section text search_writing hands over per article (intro gets up to a third). */
export const SECTION_BUDGET_CHARS = 6_000;
/** Most stage-1 survivors stage 2 scores, best probability first: a flat spread can't fan out into dozens of scores. */
export const STAGE2_MAX = 8;
/** Most topics one search_writing call takes; each is searched separately. */
export const MAX_TOPICS = 3;
/** Most characters the library tree (themes → articles) may take in the system prompt. */
export const TREE_MAX_CHARS = 32_000;
/** Most distinct articles one reply may read, across search_writing and read_writing. A safety ceiling, not a target: GPT stops when it has enough. */
export const MAX_ARTICLES_PER_REPLY = 10;
/** Calls of each reading tool per reply: three rounds of reading still leave the loop's fourth round to answer. */
export const MAX_READING_CALLS = 3;
