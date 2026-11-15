import { TypeSafeClient, score } from "@typesafe-ai/sdk";
import { memoSections, type Section } from "@/lib/article-sections";
import { SECTION_BUDGET_CHARS } from "@/lib/search-config";
import { JEV_MODEL } from "@/lib/writing-search";

// ---------------------------------------------------------------------------
// Picks the sections of one article worth reading for a focus (the search
// query, or later a read_writing focus). Jev decides, section by section,
// on its heading and one-line note; the model then reads only those, inside
// a per-article character budget, instead of the first 12,000 characters.
// Fails open: Jev down → sections in article order up to the budget.
// ---------------------------------------------------------------------------

export const SECTION_PICK_MS = 2_000;

export const SECTION_RUBRIC = [
  "Not about the query.",
  "Mentions it in passing.",
  "Covers part of the query substantially.",
  "Directly answers the query, or one of its parts.",
] as const;

export type PickInput = { slug: string; body: string; outline?: string[]; sectionNotes?: Record<string, string> };

export type PickedArticle = { outline: string[]; sections: { heading: string | null; text: string }[]; truncated: boolean };

export type SectionTrace = {
  slug: string;
  focus: string;
  scored: { key: string; score: number | null }[];
  chosen: string[];
  fallback: "none" | "short" | "jev_failed";
  startedAt: number;
  ms: number;
};

type JevClient = Pick<TypeSafeClient, "systemOne">;

export type PickOptions = {
  client?: JevClient;
  signal?: AbortSignal;
  budget?: number;
  onTrace?: (t: SectionTrace) => void;
};

let defaultClient: TypeSafeClient | null = null;
const getClient = () => (defaultClient ??= new TypeSafeClient({ defaultModel: JEV_MODEL }));

const isScore = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= SECTION_RUBRIC.length - 1;

export async function pickSections(article: PickInput, focus: string, opts: PickOptions = {}): Promise<PickedArticle> {
  const budget = opts.budget ?? SECTION_BUDGET_CHARS;
  const startedAt = Date.now();
  const outline = article.outline ?? [];
  const all = memoSections(article.slug, article.body);
  const trace: SectionTrace = { slug: article.slug, focus, scored: [], chosen: [], fallback: "none", startedAt, ms: 0 };
  const finish = (picked: PickedArticle, chosenKeys: string[]) => {
    trace.ms = Date.now() - startedAt;
    trace.chosen = chosenKeys;
    opts.onTrace?.(trace);
    return picked;
  };

  const total = all.reduce((sum, s) => sum + s.body.length, 0);
  if (total <= budget) {
    trace.fallback = "short";
    return finish({ outline, sections: all.map(toPicked), truncated: false }, all.map((s) => s.key));
  }

  const intro = all[0]?.heading === null ? all[0] : null;
  const rest = intro ? all.slice(1) : all;
  if (rest.length === 0) {
    // Only an intro, and it's over budget: it gets the whole budget.
    return finish({ outline, sections: [{ heading: null, text: intro!.body.slice(0, budget) }], truncated: true }, [intro!.key]);
  }

  const introText = intro ? intro.body.slice(0, Math.floor(budget / 3)) : null;
  const remaining = budget - (introText?.length ?? 0);

  let order: Section[];
  try {
    const client = opts.client ?? getClient();
    const result = await client.systemOne(
      {
        state: { query: focus },
        // Keyed by position: heading text (spaces, punctuation, repeats) never becomes a question id.
        questions: Object.fromEntries(
          rest.map((s, i) => [
            `s${i}`,
            score(
              {
                task: "How well does this section of my article answer the search query?",
                section: { heading: s.heading, note: article.sectionNotes?.[s.key] ?? null },
              },
              SECTION_RUBRIC
            ),
          ])
        ),
      },
      { timeout: SECTION_PICK_MS, retry: { maxRetries: 0 }, signal: opts.signal }
    );
    const answers = (result.answers ?? {}) as Record<string, { score?: unknown } | undefined>;
    const scored = rest.map((s, i) => {
      const raw = answers[`s${i}`]?.score;
      return { s, i, score: isScore(raw) ? raw : null };
    });
    trace.scored = scored.map(({ s, score: sc }) => ({ key: s.key, score: sc }));
    // Best first; null scores last; ties keep article order.
    order = [...scored].sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || x.i - y.i).map((x) => x.s);
  } catch {
    trace.fallback = "jev_failed";
    order = rest;
  }

  // The best section always comes back, cut to the budget if it's too long; the rest fill what's left, best first.
  const top = order[0];
  const topText = top.body.slice(0, remaining);
  const chosen = new Set<Section>([top]);
  let used = topText.length;
  for (const s of order.slice(1)) {
    if (used + s.body.length > remaining) continue;
    chosen.add(s);
    used += s.body.length;
  }

  const sections: PickedArticle["sections"] = [];
  const keys: string[] = [];
  if (intro && introText !== null) {
    sections.push({ heading: null, text: introText });
    keys.push(intro.key);
  }
  for (const s of rest)
    if (chosen.has(s)) {
      sections.push(s === top ? { heading: s.heading, text: topText } : toPicked(s));
      keys.push(s.key);
    }
  return finish({ outline, sections, truncated: true }, keys);
}

const toPicked = (s: Section) => ({ heading: s.heading, text: s.body });
