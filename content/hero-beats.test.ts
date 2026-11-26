import { existsSync } from "node:fs";
import { join } from "node:path";
import githubMeta from "@/content/github-meta.json";
import logoManifest from "@/content/hero-logos.json";
import { ARTICLE_COUNT_NUMBER } from "@/lib/content";
import { HERO_BEATS, HERO_EXTRA_LOGOS } from "./hero-beats";

const LOGO_DIR = join(__dirname, "..", "public", "logos");
const MANIFEST = logoManifest as Record<string, { file: string; r: number }>;

/** Every tool name a beat uses, plus the logos that only drift at rest. */
const ALL_TOOLS = [...new Set([...HERO_BEATS.flatMap((b) => b.tools), ...HERO_EXTRA_LOGOS])];

describe("hero beats", () => {
  it("has 45 beats", () => {
    expect(HERO_BEATS).toHaveLength(45);
  });

  it("gives every beat a caption and a source line", () => {
    HERO_BEATS.forEach((beat, i) => {
      expect(beat.cap.trim().length).toBeGreaterThan(0);
      expect(beat.sub.trim().length).toBeGreaterThan(0);
      expect(Array.isArray(beat.tools)).toBe(true);
      expect(`${i}: ${beat.cap}`).toBeTruthy();
    });
  });

  it("opens on the site-wide statistics caption, filled from data", () => {
    const first = HERO_BEATS[0];
    expect(first.cap).toContain(`${ARTICLE_COUNT_NUMBER} articles`);
    expect(first.cap).toContain(`${githubMeta.publicRepos} repos`);
    expect(first.cap).toBe(`${ARTICLE_COUNT_NUMBER} articles and ${githubMeta.publicRepos} repos, all public`);
  });

  it("only uses the layout flags the animation understands", () => {
    const allowed = new Set(["cap", "sub", "tools", "all", "grid", "chain"]);
    for (const beat of HERO_BEATS) {
      Object.keys(beat).forEach((key) => expect(allowed.has(key)).toBe(true));
    }
  });

  it("has a blockchain beat with the chain flag", () => {
    expect(HERO_BEATS.some((b) => b.chain === true)).toBe(true);
  });

  it("uses no tools that are not in the logo manifest", () => {
    // A tool with no manifest entry would silently draw nothing, so catch it here.
    for (const beat of HERO_BEATS) {
      for (const tool of beat.tools) {
        expect({ beat: beat.cap, tool, inManifest: tool in MANIFEST }).toEqual({
          beat: beat.cap,
          tool,
          inManifest: true,
        });
      }
    }
  });
});

describe("hero logo manifest", () => {
  it("has a manifest entry for every tool a beat uses", () => {
    const missing = ALL_TOOLS.filter((t) => !(t in MANIFEST));
    expect(missing).toEqual([]);
  });

  it("has an extra resting logo for every name in HERO_EXTRA_LOGOS", () => {
    HERO_EXTRA_LOGOS.forEach((name) => expect(name in MANIFEST).toBe(true));
  });

  it("gives every manifest entry an ink and a colour file name and a positive aspect ratio", () => {
    for (const [name, entry] of Object.entries(MANIFEST)) {
      expect({ name, file: typeof entry.file, ok: entry.file.length > 0 }).toEqual({ name, file: "string", ok: true });
      expect(entry.r).toBeGreaterThan(0);
    }
  });

  it("has both the ink and the colour SVG on disk for every logo the animation draws", () => {
    const missing: string[] = [];
    for (const name of ALL_TOOLS) {
      const entry = MANIFEST[name];
      if (!entry) continue;
      for (const variant of ["ink", "colour"]) {
        const path = join(LOGO_DIR, `${entry.file}.${variant}.svg`);
        if (!existsSync(path)) missing.push(`${name}: ${entry.file}.${variant}.svg`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("points each logo name at a unique file", () => {
    const files = Object.values(MANIFEST).map((e) => e.file);
    expect(new Set(files).size).toBe(files.length);
  });
});

describe("TypeScript is not a hero logo", () => {
  const beatTools = HERO_BEATS.flatMap((b) => b.tools);

  it("has no manifest entry, resting logo or beat that names TypeScript", () => {
    expect(Object.keys(MANIFEST).filter((k) => /typescript/i.test(k))).toEqual([]);
    expect(HERO_EXTRA_LOGOS.filter((n) => /typescript/i.test(n))).toEqual([]);
    expect(beatTools.filter((n) => /typescript/i.test(n))).toEqual([]);
  });

  it("has no TypeScript logo files left in the logo directory", () => {
    expect(existsSync(join(LOGO_DIR, "typescript.ink.svg"))).toBe(false);
    expect(existsSync(join(LOGO_DIR, "typescript.colour.svg"))).toBe(false);
  });
});
