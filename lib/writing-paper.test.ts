import articleThemes from "@/content/article-themes.json";
import { ARTICLES, type Article } from "./articles";
import { dek, desks, editions, opening, stories, type Story } from "./writing-paper";

const assignments = articleThemes.assignments as Record<string, string[]>;

/** A minimal Article; only the fields the paper reads matter. */
function article(over: Partial<Article> & { slug: string }): Article {
  return {
    title: `Title of ${over.slug}`,
    url: `https://medium.com/@tituslhy/${over.slug}`,
    publishedAt: "2026-01-01T09:00:00.000Z",
    summary: "A plain summary.",
    keywords: [],
    outline: [],
    intro: "An intro.",
    body: "",
    words: 100,
    ...over,
  };
}

/** A sentence exactly `len` characters long, ending in a full stop and containing no spaces. */
const sentence = (len: number) => "a".repeat(len - 1) + ".";

describe("dek", () => {
  it.each([
    ["The article experiments with X", "Experiments with X"],
    ["This article explains Y", "Explains Y"],
    ["The post walks through Z", "Walks through Z"],
    ["This post compares A and B", "Compares A and B"],
    ["The piece argues for patience", "Argues for patience"],
    ["This piece looks at caching", "Looks at caching"],
    ["The tutorial builds a chatbot", "Builds a chatbot"],
    ["This tutorial sets up Qdrant", "Sets up Qdrant"],
  ])("turns %j into a standfirst: %j", (summary, expected) => {
    expect(dek(summary)).toBe(expected);
  });

  it("leaves a summary that does not start with a stock opener as it is, capitalised", () => {
    expect(dek("a guide to evaluation")).toBe("A guide to evaluation");
    expect(dek("Agent memory in practice.")).toBe("Agent memory in practice.");
  });

  it("does not strip a word that only starts like an opener (articles, posts)", () => {
    expect(dek("The articles on this site are useful")).toBe("The articles on this site are useful");
    expect(dek("The postmortem of a launch")).toBe("The postmortem of a launch");
  });

  it("trims surrounding whitespace before stripping", () => {
    expect(dek("   The article covers caching.  ")).toBe("Covers caching.");
  });

  it("returns an empty string for an empty summary", () => {
    expect(dek("")).toBe("");
  });
});

describe("opening", () => {
  it("returns the intro itself when it is short (under 260 characters)", () => {
    expect(opening("Short one. Second short one.")).toBe("Short one. Second short one.");
  });

  it("returns an intro of 260–560 characters with no sentence end, untouched", () => {
    const intro = "word ".repeat(80).trim(); // 399 characters, no full stop
    expect(opening(intro)).toBe(intro);
  });

  it("collapses internal whitespace and newlines, and trims the ends", () => {
    expect(opening("  First   line.\n\nSecond line.  ")).toBe("First line. Second line.");
  });

  it("stops at the first sentence end at or past 260 characters", () => {
    const first = sentence(300);
    expect(opening(`${first} ${sentence(50)} ${sentence(40)}`)).toBe(first);
  });

  it("keeps adding sentences until the total reaches 260 characters", () => {
    const a = sentence(100);
    const b = sentence(200);
    const intro = `${a} ${b} ${sentence(300)}`;
    expect(opening(intro)).toBe(`${a} ${b}`);
  });

  it("includes a sentence that ends at exactly 260 characters", () => {
    expect(opening(`${sentence(260)} ${sentence(100)}`)).toBe(sentence(260));
  });

  it("includes a sentence that ends at exactly 560 characters", () => {
    expect(opening(`${sentence(560)} ${sentence(100)}`)).toBe(sentence(560));
  });

  it("treats ! and ? as sentence ends too", () => {
    const first = `${"a".repeat(269)}!`;
    expect(opening(`${first} ${sentence(50)}`)).toBe(first);
    const q = `${"b".repeat(269)}?`;
    expect(opening(`${q} ${sentence(50)}`)).toBe(q);
  });

  it("does not end a sentence on a full stop inside a word (1.5, v2.0)", () => {
    const intro = `${"x".repeat(250)} version 1.5 is out. ${sentence(100)}`;
    expect(opening(intro)).toBe(`${"x".repeat(250)} version 1.5 is out.`);
  });

  it("cuts at a word boundary before 560 characters and adds an ellipsis", () => {
    const intro = "word ".repeat(200).trim(); // 999 characters, no full stop
    const expected = `${intro.slice(0, intro.lastIndexOf(" ", 560))}…`;
    expect(opening(intro)).toBe(expected);
    expect(opening(intro).length).toBeLessThanOrEqual(561);
  });

  it("never returns more than 561 characters: with no space before 560, it cuts at 560 and adds an ellipsis", () => {
    const intro = `${"a".repeat(600)} tail`;
    const result = opening(intro);
    expect(result).toBe(`${"a".repeat(560)}…`);
    expect(result.length).toBeLessThanOrEqual(561);
  });

  it("with no sentence end in 260–560, cuts at the last space before 560 and adds an ellipsis", () => {
    // The only sentence ends short (100 characters), so the opening falls back to a word-boundary cut.
    const intro = `${sentence(100)} ${"word ".repeat(120).trim()}`;
    const result = opening(intro);
    expect(result).toBe(`${intro.slice(0, intro.lastIndexOf(" ", 560))}…`);
    expect(result.length).toBeGreaterThanOrEqual(260);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("stories", () => {
  it("lists every article as a story, newest first", () => {
    const list = stories([
      article({ slug: "old", publishedAt: "2024-03-01T10:00:00.000Z" }),
      article({ slug: "new", publishedAt: "2026-10-16T08:30:00.000Z" }),
      article({ slug: "mid", publishedAt: "2025-06-02T23:59:00.000Z" }),
    ]);
    expect(list.map((s) => s.slug)).toEqual(["new", "mid", "old"]);
  });

  it("does not reorder the articles it was given", () => {
    const input = [article({ slug: "a", publishedAt: "2024-01-01T00:00:00Z" }), article({ slug: "b", publishedAt: "2026-01-01T00:00:00Z" })];
    stories(input);
    expect(input.map((a) => a.slug)).toEqual(["a", "b"]);
  });

  it("gives the date as YYYY-MM-DD and the edition as the year", () => {
    const [s] = stories([article({ slug: "x", publishedAt: "2026-10-16T08:30:00.000Z" })]);
    expect(s.date).toBe("2026-10-16");
    expect(s.year).toBe("2026");
  });

  it("carries slug, title and url straight from the article", () => {
    const [s] = stories([article({ slug: "agent-memory", title: "Agent memory", url: "https://medium.com/x" })]);
    expect(s).toMatchObject({ slug: "agent-memory", title: "Agent memory", url: "https://medium.com/x" });
  });

  it("files the story under the first desk its slug is assigned to", () => {
    const slug = Object.keys(assignments)[0];
    const [s] = stories([article({ slug })]);
    expect(s.desk).toBe(assignments[slug][0]);
  });

  it("leaves the desk off when the themes file does not list the article", () => {
    const [s] = stories([article({ slug: "not-in-the-themes-file" })]);
    expect(s).not.toHaveProperty("desk");
  });

  it("builds the standfirst from the summary and the opening from the intro", () => {
    const [s] = stories([article({ slug: "x", summary: "The article shows how caching works.", intro: "Caching is fast. It is also hard." })]);
    expect(s.dek).toBe("Shows how caching works.");
    expect(s.opening).toBe("Caching is fast. It is also hard.");
  });

  it("carries the cover when the article has one", () => {
    const cover = { src: "https://cdn-images-1.medium.com/max/1400/1*a.png", caption: "A diagram" };
    const [s] = stories([article({ slug: "x", cover })]);
    expect(s.cover).toEqual(cover);
  });

  it("leaves the cover off when the article has none", () => {
    const [s] = stories([article({ slug: "x" })]);
    expect(s).not.toHaveProperty("cover");
  });

  it("returns an empty list for no articles", () => {
    expect(stories([])).toEqual([]);
  });
});

describe("desks", () => {
  const story = (over: Partial<Story> & { slug: string }): Story => ({
    title: "t",
    url: "https://x",
    date: "2026-01-01",
    year: "2026",
    dek: "d",
    opening: "o",
    ...over,
  });

  it("lists the desks alphabetically by name, each with its story count", () => {
    const list = [
      story({ slug: "1", desk: "copilots" }),
      story({ slug: "2", desk: "blockchain" }),
      story({ slug: "3", desk: "copilots" }),
    ];
    expect(desks(list)).toEqual([
      { id: "blockchain", name: "Blockchain", count: 1 },
      { id: "copilots", name: "Copilots", count: 2 },
    ]);
  });

  it("leaves out desks with no stories", () => {
    const ids = desks([story({ slug: "1", desk: "blockchain" })]).map((d) => d.id);
    expect(ids).toEqual(["blockchain"]);
  });

  it("ignores stories with no desk", () => {
    expect(desks([story({ slug: "1" })])).toEqual([]);
  });

  it("uses the full theme name, not the shortened chip name", () => {
    const names = desks([story({ slug: "1", desk: "evaluating-testing" })]).map((d) => d.name);
    expect(names).toEqual(["Evaluating and Testing Agents"]);
  });

  it("returns no desks for no stories", () => {
    expect(desks([])).toEqual([]);
  });
});

describe("editions", () => {
  const story = (year: string): Story => ({
    slug: `s-${year}-${Math.random()}`,
    title: "t",
    url: "https://x",
    date: `${year}-01-01`,
    year,
    dek: "d",
    opening: "o",
  });

  it("lists the years newest first, each with its story count", () => {
    const list = [story("2024"), story("2026"), story("2025"), story("2026")];
    expect(editions(list)).toEqual([
      { year: "2026", count: 2 },
      { year: "2025", count: 1 },
      { year: "2024", count: 1 },
    ]);
  });

  it("gives one edition per distinct year, even with many stories in it", () => {
    const list = Array.from({ length: 5 }, () => story("2025"));
    expect(editions(list)).toEqual([{ year: "2025", count: 5 }]);
  });

  it("returns no editions for no stories", () => {
    expect(editions([])).toEqual([]);
  });
});

describe("the real articles", () => {
  const all = stories();

  it("has one story per article in the corpus (65)", () => {
    expect(ARTICLES).toHaveLength(65);
    expect(all).toHaveLength(65);
  });

  it("files every story under exactly one desk, its first theme", () => {
    const known = new Set(articleThemes.themes.map((t) => t.id));
    for (const s of all) {
      expect(s.desk).toBeDefined();
      expect([1, 2]).toContain(assignments[s.slug].length);
      expect(assignments[s.slug].every((id) => known.has(id))).toBe(true);
      expect(s.desk).toBe(assignments[s.slug][0]);
    }
  });

  it("files a two-theme article under its first theme's desk only", () => {
    const slug = Object.keys(assignments).find((s) => assignments[s].length === 2);
    expect(slug).toBeDefined();
    const [first, second] = assignments[slug as string];
    const [story] = stories([article({ slug: slug as string })]);

    expect(story.desk).toBe(first);
    expect(story.desk).not.toBe(second);
    expect(desks([story]).map((d) => d.id)).toEqual([first]);
  });

  it("has desk counts that sum to the story count", () => {
    const counted = desks(all);
    expect(counted.reduce((sum, d) => sum + d.count, 0)).toBe(all.length);
  });

  it("has 10 desks, every one of them with stories", () => {
    const counted = desks(all);
    expect(counted).toHaveLength(10);
    expect(counted.every((d) => d.count > 0)).toBe(true);
  });

  it("lists the stories newest first", () => {
    const dates = all.map((s) => s.date);
    const sorted = [...dates].sort((a, b) => b.localeCompare(a));
    expect(dates).toEqual(sorted);
  });

  it("gives every story a standfirst and an opening", () => {
    for (const s of all) {
      expect(s.dek.length).toBeGreaterThan(0);
      expect(s.opening.length).toBeGreaterThan(0);
      expect(s.opening.length).toBeLessThanOrEqual(561);
    }
  });

  it("has editions covering every story", () => {
    expect(editions(all).reduce((sum, e) => sum + e.count, 0)).toBe(all.length);
  });
});

describe('stories: the Medium post id', () => {
  it('gives a story the Medium post id at the end of its url, so a pick (?read=) can name it', () => {
    const [s] = stories([article({ slug: 'with-id', url: 'https://medium.com/@tituslhy/a-title-abcdef123456' })])
    expect(s.id).toBe('abcdef123456')
  })

  it('leaves the id off a story whose url has no Medium post id', () => {
    const [s] = stories([article({ slug: 'no-id', url: 'https://medium.com/@tituslhy/no-id-here' })])
    expect(s).not.toHaveProperty('id')
  })
})
