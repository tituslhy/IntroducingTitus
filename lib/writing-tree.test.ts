import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Article } from "@/lib/articles";
import { ARTICLES } from "@/lib/articles";
import { TREE_MAX_CHARS } from "@/lib/search-config";
import { renderWritingTree, themesProblems, type Themes } from "@/lib/writing-tree";

/** A complete Article fixture; only the fields the tree reads matter, the rest are filler. */
function article(slug: string, overrides: Partial<Article> = {}): Article {
  return {
    slug,
    title: `Title ${slug}`,
    url: `https://medium.com/@tituslhy/${slug}-000000000000`,
    publishedAt: "2025-01-01T00:00:00.000Z",
    summary: `Summary ${slug}`,
    keywords: ["keyword"],
    outline: ["Heading"],
    intro: `Intro ${slug}`,
    body: `Body of ${slug}`,
    words: 500,
    ...overrides,
  };
}

const THEMES: Themes["themes"] = [
  { id: "t1", name: "Agents", description: "Building agents" },
  { id: "t2", name: "Finetuning", description: "Training models" },
  { id: "t3", name: "Empty", description: "Nothing here" },
];

const OLD_AGENT = article("old-agent", {
  title: "Old Agent",
  url: "https://medium.com/@tituslhy/old-agent-aaaaaaaaaaaa",
  publishedAt: "2024-03-05T10:00:00.000Z",
  summary: "Old summary",
});
const NEW_AGENT = article("new-agent", {
  title: "New Agent",
  url: "https://medium.com/@tituslhy/new-agent-bbbbbbbbbbbb",
  publishedAt: "2026-01-10T09:00:00.000Z",
  summary: "New summary",
});
const TUNE = article("tune", {
  title: "Tuning",
  url: "https://medium.com/mitb-for-all/tune-cccccccccccc",
  publishedAt: "2025-06-18T10:00:00.000Z",
  summary: "Tune summary",
});
const BOTH = article("both", {
  title: "Both",
  url: "https://medium.com/@tituslhy/both-dddddddddddd",
  publishedAt: "2025-02-01T10:00:00.000Z",
  summary: "Both summary",
});

const ARTICLES_FIXTURE = [OLD_AGENT, NEW_AGENT, TUNE, BOTH];

const CLEAN_THEMES: Themes = {
  themes: THEMES,
  assignments: {
    "old-agent": ["t1"],
    "new-agent": ["t1"],
    tune: ["t2"],
    both: ["t1", "t2"],
  },
  reviewed: { "old-agent": true, "new-agent": true, tune: true, both: true },
  themesReviewed: true,
};

describe("renderWritingTree", () => {
  it("renders themes with post-id lines, newest first", () => {
    expect(renderWritingTree(ARTICLES_FIXTURE, CLEAN_THEMES)).toBe(
      [
        "### Agents — Building agents",
        "- bbbbbbbbbbbb New Agent (2026-01): New summary",
        "- dddddddddddd Both (2025-02): Both summary",
        "- aaaaaaaaaaaa Old Agent (2024-03): Old summary",
        "",
        "### Finetuning — Training models",
        "- cccccccccccc Tuning (2025-06): Tune summary",
        "- dddddddddddd Both (2025-02): Both summary",
      ].join("\n")
    );
  });

  it("lists a multi-theme article under each theme", () => {
    const out = renderWritingTree(ARTICLES_FIXTURE, CLEAN_THEMES);

    const lines = out.split("\n").filter((l) => l.includes("Both (2025-02)"));
    expect(lines).toHaveLength(2);
  });

  it("uses the exact heading format with an em dash and single spaces", () => {
    const headings = renderWritingTree(ARTICLES_FIXTURE, CLEAN_THEMES)
      .split("\n")
      .filter((l) => l.startsWith("### "));

    expect(headings).toEqual(["### Agents — Building agents", "### Finetuning — Training models"]);
  });

  it("separates theme blocks by one blank line with no trailing newline", () => {
    const out = renderWritingTree(ARTICLES_FIXTURE, CLEAN_THEMES);

    expect(out).toContain("\n\n### Finetuning");
    expect(out.endsWith("\n")).toBe(false);
    expect(out).not.toContain("\n\n\n");
  });

  it("omits a theme with no articles entirely", () => {
    const out = renderWritingTree(ARTICLES_FIXTURE, CLEAN_THEMES);

    expect(out).not.toContain("### Empty");
    expect(out).not.toContain("Nothing here");
  });

  it("orders articles with the same date by title ascending", () => {
    const zeta = article("zeta", {
      title: "Zeta",
      url: "https://medium.com/@tituslhy/zeta-111111111111",
      publishedAt: "2025-05-01T00:00:00.000Z",
    });
    const alpha = article("alpha", {
      title: "Alpha",
      url: "https://medium.com/@tituslhy/alpha-222222222222",
      publishedAt: "2025-05-01T00:00:00.000Z",
    });
    const themes: Themes = {
      themes: [THEMES[0]],
      assignments: { zeta: ["t1"], alpha: ["t1"] },
      reviewed: { zeta: true, alpha: true },
      themesReviewed: true,
    };

    const lines = renderWritingTree([zeta, alpha], themes).split("\n").filter((l) => l.startsWith("- "));

    expect(lines).toEqual([
      "- 222222222222 Alpha (2025-05): Summary alpha",
      "- 111111111111 Zeta (2025-05): Summary zeta",
    ]);
  });

  it("falls back to the slug when the URL has no Medium post id", () => {
    const plain = article("plain-slug", {
      title: "Plain",
      url: "https://example.com/plain-slug",
      publishedAt: "2025-01-15T00:00:00.000Z",
      summary: "Plain summary",
    });
    const themes: Themes = {
      themes: [THEMES[0]],
      assignments: { "plain-slug": ["t1"] },
      reviewed: { "plain-slug": true },
      themesReviewed: true,
    };

    expect(renderWritingTree([plain], themes)).toBe(
      ["### Agents — Building agents", "- plain-slug Plain (2025-01): Plain summary"].join("\n")
    );
  });

  it("ignores assignments to unknown theme ids and to slugs not in the articles", () => {
    const themes: Themes = {
      themes: [THEMES[0]],
      assignments: { "old-agent": ["t9"], "ghost-slug": ["t1"] },
      reviewed: { "old-agent": true },
      themesReviewed: true,
    };

    expect(renderWritingTree([OLD_AGENT], themes)).toBe("");
  });

  it("renders no theme blocks when no article is assigned", () => {
    const themes: Themes = { themes: THEMES, assignments: {}, reviewed: {}, themesReviewed: true };

    expect(renderWritingTree(ARTICLES_FIXTURE, themes)).toBe("");
  });
});

describe("themesProblems", () => {
  it("themesProblems is empty for clean input", () => {
    expect(themesProblems(ARTICLES_FIXTURE, CLEAN_THEMES)).toEqual([]);
  });

  it("themesProblems reports unthemed, unknown-theme and unreviewed entries", () => {
    const articles = [OLD_AGENT, NEW_AGENT, TUNE];
    const themes: Themes = {
      themes: THEMES,
      assignments: { "new-agent": ["t9"], tune: ["t2"] },
      reviewed: { "old-agent": true, "new-agent": true, tune: false },
      themesReviewed: true,
    };

    expect(themesProblems(articles, themes)).toEqual([
      "unthemed: old-agent",
      "unthemed: new-agent",
      'unknown theme "t9" for new-agent',
      "unreviewed: tune",
    ]);
  });

  it("reports an empty assignment list as unthemed", () => {
    const themes: Themes = {
      themes: THEMES,
      assignments: { "old-agent": [] },
      reviewed: { "old-agent": true },
      themesReviewed: true,
    };

    expect(themesProblems([OLD_AGENT], themes)).toEqual(["unthemed: old-agent"]);
  });

  it("reports an unknown id even when the article also has a valid theme, and does not call it unthemed", () => {
    const themes: Themes = {
      themes: THEMES,
      assignments: { "old-agent": ["t1", "t9"] },
      reviewed: { "old-agent": true },
      themesReviewed: true,
    };

    expect(themesProblems([OLD_AGENT], themes)).toEqual(['unknown theme "t9" for old-agent']);
  });

  it("reports an article that has no reviewed flag at all as unreviewed", () => {
    const themes: Themes = {
      themes: THEMES,
      assignments: { "old-agent": ["t1"] },
      reviewed: {},
      themesReviewed: true,
    };

    expect(themesProblems([OLD_AGENT], themes)).toEqual(["unreviewed: old-agent"]);
  });

  it("puts 'themes not reviewed' first when the themes are unreviewed", () => {
    const themes: Themes = { ...CLEAN_THEMES, themesReviewed: false };

    expect(themesProblems(ARTICLES_FIXTURE, themes)).toEqual(["themes not reviewed"]);
  });

  it("does not report assignments for slugs that are not in the articles", () => {
    const themes: Themes = {
      themes: THEMES,
      assignments: { "old-agent": ["t1"], "ghost-slug": ["t9"] },
      reviewed: { "old-agent": true, "ghost-slug": false },
      themesReviewed: true,
    };

    expect(themesProblems([OLD_AGENT], themes)).toEqual([]);
  });

  it("reports articles in the order they are given", () => {
    const themes: Themes = { themes: THEMES, assignments: {}, reviewed: {}, themesReviewed: true };

    expect(themesProblems([TUNE, OLD_AGENT], themes)).toEqual([
      "unthemed: tune",
      "unreviewed: tune",
      "unthemed: old-agent",
      "unreviewed: old-agent",
    ]);
  });
});

describe("real writing tree", () => {
  const themesPath = join(process.cwd(), "content", "article-themes.json");
  const TREE_NAME = "real tree stays under TREE_MAX_CHARS";

  if (!existsSync(themesPath)) {
    console.warn(`${TREE_NAME}: skipped until content/article-themes.json exists (run npm run articles:build)`);
  }

  // Runs only when the generated themes file exists; otherwise it is reported as skipped.
  (existsSync(themesPath) ? it : it.skip)(TREE_NAME, () => {
    const themes = JSON.parse(readFileSync(themesPath, "utf8")) as Themes;

    expect(renderWritingTree(ARTICLES, themes).length).toBeLessThanOrEqual(TREE_MAX_CHARS);
  });
});
