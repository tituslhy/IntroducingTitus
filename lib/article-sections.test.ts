import { ARTICLES } from "@/lib/articles";
import { memoSections, normalizeHeading, sectionKey, splitSections } from "@/lib/article-sections";

describe("splitSections", () => {
  it("splits on headings and keeps the intro", () => {
    const sections = splitSections("Intro text\n\n### One\nA\n#### Two\nB");

    expect(sections.map((s) => s.key)).toEqual(["(intro)", "One", "Two"]);
    expect(sections.map((s) => s.heading)).toEqual([null, "One", "Two"]);
    expect(sections.map((s) => s.body)).toEqual(["Intro text", "A", "B"]);
  });

  it("omits a blank intro", () => {
    const sections = splitSections("### One\nA");

    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("One");
  });

  it("ignores # lines inside backtick and tilde fences", () => {
    const body = [
      "Intro",
      "",
      "### Code",
      "```python",
      "# comment",
      "## also not a heading",
      "```",
      "After",
      "",
      "~~~",
      "# tilde comment",
      "~~~",
      "Tail",
    ].join("\n");

    const sections = splitSections(body);

    expect(sections.map((s) => s.key)).toEqual(["(intro)", "Code"]);
    expect(sections[1].body).toContain("# comment");
    expect(sections[1].body).toContain("## also not a heading");
    expect(sections[1].body).toContain("# tilde comment");
    expect(sections[1].body).toContain("Tail");
  });

  it("treats an article with no headings as one intro section", () => {
    const sections = splitSections("Just prose.\n\nMore prose.");

    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("(intro)");
    expect(sections[0].heading).toBeNull();
  });

  it("gives repeated headings occurrence suffixes", () => {
    const sections = splitSections("### Final thoughts\nA\n### Final thoughts\nB\n### Final thoughts\nC");

    expect(sections.map((s) => s.key)).toEqual(["Final thoughts", "Final thoughts (2)", "Final thoughts (3)"]);
  });

  it("requires a space after the hashes", () => {
    const sections = splitSections("#hashtag line\nText");

    expect(sections).toHaveLength(1);
    expect(sections[0].key).toBe("(intro)");
    expect(sections[0].body).toBe("#hashtag line\nText");
  });
});

describe("normalizeHeading", () => {
  it("strips hashes and underscore emphasis", () => {
    expect(normalizeHeading("#### _Catching Jev-er_ now")).toBe("Catching Jev-er now");
  });

  it("strips bold, code backticks, trailing spaces, and collapses internal whitespace", () => {
    expect(normalizeHeading("**Bold** and `code`  spaced   out  ")).toBe("Bold and code spaced out");
  });
});

describe("sectionKey", () => {
  it("names the intro (intro) regardless of occurrence", () => {
    expect(sectionKey(null, 1)).toBe("(intro)");
  });

  it("uses the heading for its first occurrence", () => {
    expect(sectionKey("One", 1)).toBe("One");
  });

  it("suffixes later occurrences with their number", () => {
    expect(sectionKey("One", 2)).toBe("One (2)");
  });
});

describe("memoSections", () => {
  it("returns the same array for the same slug", () => {
    const body = "Intro\n\n### One\nA";

    const first = memoSections("memo-test-slug", body);
    const second = memoSections("memo-test-slug", body);

    expect(second).toBe(first);
  });

  it("equals splitSections for the body", () => {
    const body = "Intro\n\n### One\nA\n### Two\nB";

    expect(memoSections("memo-equal-slug", body)).toEqual(splitSections(body));
  });
});

describe("splitSections against the real corpus", () => {
  it.each(ARTICLES.map((a) => [a.slug, a] as const))("%s: heading count is close to the outline", (_slug, article) => {
    const headed = splitSections(article.body).filter((s) => s.heading !== null);

    expect(Math.abs(headed.length - article.outline.length)).toBeLessThanOrEqual(2);
  });

  it.each(ARTICLES.map((a) => [a.slug, a] as const))("%s: no non-heading text is lost", (_slug, article) => {
    const joined = splitSections(article.body)
      .map((s) => s.body)
      .join("\n");

    const lost = article.body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "" && !/^#{1,6} /.test(line))
      .filter((line) => !joined.includes(line));

    expect(lost).toEqual([]);
  });
});
