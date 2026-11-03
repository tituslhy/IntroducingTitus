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
export const PAGE_SIZE = 2;
