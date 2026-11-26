/**
 * Guard (front-page design doc: "every number on the page comes from data"). The front page
 * must not type a site statistic into its components. The live values are read from the data,
 * then the component sources are searched for them as literals.
 *
 * Big values (the article and repo counts) are caught wherever they stand as a number.
 * Small values (6, 7, 8, theme counts) are everywhere in canvas maths, so they are caught only
 * next to the noun they count ("6 contributions", "seven roles", "Agentic Systems 23").
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import githubMeta from "@/content/github-meta.json";
import { ARTICLE_COUNT_NUMBER, YEARS_EXPERIENCE_NUMBER, numberToWords } from "@/lib/content";
import { themeCounts } from "@/lib/front-page";
import { OPEN_SOURCE, ROLES } from "@/lib/profile";

const ROOT = join(__dirname, "..", "..");

/** The front page's components: the hero and everything in components/front, minus tests. */
function frontSources(): { file: string; code: string }[] {
  const dir = join(ROOT, "components", "front");
  const files = [
    join(ROOT, "components", "Hero.tsx"),
    ...readdirSync(dir)
      .filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))
      .map((f) => join(dir, f)),
  ];
  return files.map((path) => ({
    file: path.slice(ROOT.length + 1),
    code: stripComments(readFileSync(path, "utf8")),
  }));
}

/** Removes block and line comments, so prose in a doc comment can't trip the guard. Keeps "https://" in strings. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/** A whole number as a token: not part of a longer number, a decimal, a class name or an id. */
const literal = (n: number | string) => `(?<![\\w.#-])${n}(?![\\w.%-])`;

/** The stats the front page shows, read from the data. */
function liveStats() {
  const themes = themeCounts();
  return {
    articles: ARTICLE_COUNT_NUMBER,
    repos: githubMeta.publicRepos,
    contributions: OPEN_SOURCE.length,
    roles: ROLES.length,
    years: YEARS_EXPERIENCE_NUMBER,
    themes,
  };
}

/** Every site statistic written into this code as a literal. Returns labels, e.g. "articles: 65". */
function findHardCodedStats(code: string, stats: ReturnType<typeof liveStats>): string[] {
  const found: string[] = [];
  const lines = code.split("\n");
  const near = (a: string, b: string) => new RegExp(`${a}[^\\n]{0,16}${b}|${b}[^\\n]{0,16}${a}`, "i");

  // Big values: standalone anywhere.
  if (new RegExp(literal(stats.articles)).test(code)) found.push(`articles: ${stats.articles}`);
  if (new RegExp(literal(stats.repos)).test(code)) found.push(`repos: ${stats.repos}`);

  // Small values: only beside the noun they count.
  if (near(literal(stats.contributions), "contribution").test(code))
    found.push(`contributions: ${stats.contributions}`);
  if (new RegExp(`\\b${numberToWords(stats.roles)}\\b`, "i").test(code)) found.push(`roles (word): ${numberToWords(stats.roles)}`);
  if (near(literal(stats.roles), "roles?").test(code)) found.push(`roles: ${stats.roles}`);
  if (new RegExp(`\\b${numberToWords(stats.years)}\\b`, "i").test(code)) found.push(`years (word): ${numberToWords(stats.years)}`);
  if (near(literal(stats.years), "years?").test(code)) found.push(`years: ${stats.years}`);

  // Theme chips: a theme's name with its count typed after it on the same line.
  for (const theme of stats.themes) {
    const names = [theme.name, theme.name.replace(" & ", " and ")];
    for (const name of names) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`${escaped}[^\\n]{0,40}${literal(theme.count)}`);
      if (lines.some((l) => re.test(l))) found.push(`theme "${theme.name}": ${theme.count}`);
    }
  }
  return found;
}

describe("front-page components hard-code no site statistics", () => {
  const stats = liveStats();

  it("reads the front-page component sources", () => {
    const sources = frontSources();
    const names = sources.map((s) => s.file);
    expect(names).toContain("components/Hero.tsx");
    expect(names).toContain("components/front/OpeningLine.tsx");
    expect(names).toContain("components/front/Doors.tsx");
    expect(names).toContain("components/front/AskDoor.tsx");
    expect(sources.every((s) => s.code.length > 0)).toBe(true);
  });

  it("types none of the live statistics into any front-page component", () => {
    const violations = frontSources().flatMap(({ file, code }) =>
      findHardCodedStats(code, stats).map((hit) => ({ file, hit }))
    );
    expect(violations).toEqual([]);
  });

  it("is not vacuous: the detector flags each kind of hard-coded statistic", () => {
    const bad = [
      `<p>${stats.articles} technical articles</p>`,
      `<p>${stats.repos} public repos</p>`,
      `<p>${stats.contributions} contributions back</p>`,
      `<p>${numberToWords(stats.roles)} roles, from supply-chain</p>`,
      `<p>${stats.years} years putting AI into production</p>`,
      `<span>${stats.themes[0].name}<b>${stats.themes[0].count}</b></span>`,
    ].join("\n");
    const hits = findHardCodedStats(bad, stats);
    expect(hits).toEqual(
      expect.arrayContaining([
        `articles: ${stats.articles}`,
        `repos: ${stats.repos}`,
        `contributions: ${stats.contributions}`,
        `roles (word): ${numberToWords(stats.roles)}`,
        `years: ${stats.years}`,
      ])
    );
    // A theme chip with its count typed in is flagged; the same chip with the count from data is not.
    expect(hits).toContain(`theme "${stats.themes[0].name}": ${stats.themes[0].count}`);
    expect(findHardCodedStats(`<span>{t.name}<b>{t.count}</b></span>`, stats)).toEqual([]);
  });

  it("ignores the same numbers when they are canvas maths, not statistics", () => {
    const maths = [
      "const size = 28 + (s.all ? 6 : 8) * on",
      "const rows = L.narrow ? 3 : 2",
      "x.arc(nd.x, nd.y, size * 0.72, 0, 6.29)",
      'className="w-[min(240px,60vw)] text-[65px]"',
    ].join("\n");
    expect(findHardCodedStats(maths, stats)).toEqual([]);
  });

  it("does not flag prose in comments", () => {
    const commented = stripComments(`// ${stats.articles} articles\n/* ${stats.repos} repos */\nconst a = 1`);
    expect(findHardCodedStats(commented, stats)).toEqual([]);
  });
});
