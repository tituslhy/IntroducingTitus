import type { Article } from "@/lib/articles";
import { mediumPostId } from "@/lib/citation-ledger";

// ---------------------------------------------------------------------------
// The library tree: my articles grouped under a handful of themes, one line
// each, rendered into the system prompt so the model can reason over the
// whole library for abstract questions ("which articles should I read to
// build production-ready agents?") instead of relying on one search.
// Themes and assignments live in content/article-themes.json, drafted by
// `npm run articles:build` and reviewed by me before the corpus ships.
// Pure: callers pass the articles and themes.
// ---------------------------------------------------------------------------

export type Theme = { id: string; name: string; description: string };

export type Themes = {
  themes: Theme[];
  /** Article slug → theme ids. */
  assignments: Record<string, string[]>;
  /** Article slug → whether I've checked its assignment. */
  reviewed: Record<string, boolean>;
  /** Whether I've checked the theme list itself. */
  themesReviewed: boolean;
};

const newestFirst = (x: Article, y: Article) => y.publishedAt.localeCompare(x.publishedAt) || x.title.localeCompare(y.title);

const line = (a: Article) => `- ${mediumPostId(a.url) ?? a.slug} ${a.title} (${a.publishedAt.slice(0, 7)}): ${a.summary}`;

/** One block per non-empty theme: `### name — description`, then its articles newest first. */
export function renderWritingTree(articles: readonly Article[], themes: Themes): string {
  const blocks: string[] = [];
  for (const theme of themes.themes) {
    const members = articles.filter((a) => themes.assignments[a.slug]?.includes(theme.id)).sort(newestFirst);
    if (members.length === 0) continue;
    blocks.push([`### ${theme.name} — ${theme.description}`, ...members.map(line)].join("\n"));
  }
  return blocks.join("\n\n");
}

/** Everything that keeps the themes from shipping; empty when they're ready. */
export function themesProblems(articles: readonly Article[], themes: Themes): string[] {
  const problems: string[] = [];
  if (themes.themesReviewed !== true) problems.push("themes not reviewed");
  const known = new Set(themes.themes.map((t) => t.id));
  for (const a of articles) {
    const ids = themes.assignments[a.slug] ?? [];
    if (!ids.some((id) => known.has(id))) problems.push(`unthemed: ${a.slug}`);
    for (const id of ids) if (!known.has(id)) problems.push(`unknown theme "${id}" for ${a.slug}`);
    if (themes.reviewed[a.slug] !== true) problems.push(`unreviewed: ${a.slug}`);
  }
  return problems;
}
