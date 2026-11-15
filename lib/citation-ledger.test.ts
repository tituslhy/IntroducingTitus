/**
 * @jest-environment node
 */

import { ARTICLES, type Article } from "./articles";
import {
  articleByUrl,
  formatPublished,
  formatToday,
  mediumPostId,
  parseCitations,
  publishedDate,
  renderConversationContext,
  resolveCitations,
  type PriorCitation,
} from "./citation-ledger";
import { MAX_CITATIONS, type CitationRef } from "./citations";

function article(slug: string, overrides: Partial<Article> = {}): Article {
  return {
    slug,
    title: `Title ${slug}`,
    url: `https://medium.com/@tituslhy/${slug}`,
    publishedAt: "2025-06-18T10:00:00.000Z",
    summary: `Summary ${slug}`,
    keywords: ["keyword"],
    outline: ["Heading"],
    intro: `Intro ${slug}`,
    body: `Body of ${slug}`,
    words: 500,
    ...overrides,
  };
}

// A small catalog for the unit tests. Post ids are the hex suffixes.
const ALPHA_URL = "https://medium.com/@tituslhy/alpha-1111aaaa2222";
const BETA_PUBLICATION_URL = "https://medium.com/mitb-for-all/beta-bbbb3333cccc";
const BETA_OWN_URL = "https://medium.com/@tituslhy/beta-bbbb3333cccc";
const GAMMA_URL = "https://medium.com/@tituslhy/gamma-dddd4444eeee";

const alpha = article("alpha-1111aaaa2222", { title: "Alpha", url: ALPHA_URL, publishedAt: "2025-06-18T10:00:00.000Z" });
const beta = article("beta-bbbb3333cccc", {
  title: "Beta",
  url: BETA_PUBLICATION_URL,
  publishedAt: "2024-01-02T00:00:00.000Z",
  coAuthors: ["Jane Doe", "John Roe"],
});
const gamma = article("gamma-dddd4444eeee", { title: "Gamma", url: GAMMA_URL, publishedAt: "2026-11-01T08:00:00.000Z", coAuthors: [] });
const CATALOG = [alpha, beta, gamma];

// ---------------------------------------------------------------------------
// Post ids and lookup
// ---------------------------------------------------------------------------

describe("mediumPostId", () => {
  it("reads the post id from the @tituslhy form", () => {
    expect(mediumPostId("https://medium.com/@tituslhy/agent-memory-1c16fb47f435")).toBe("1c16fb47f435");
  });

  it("reads the same post id from the publication form", () => {
    expect(mediumPostId("https://medium.com/mitb-for-all/agent-memory-1c16fb47f435")).toBe("1c16fb47f435");
  });

  it("ignores a trailing slash and a query string", () => {
    expect(mediumPostId("https://medium.com/mitb-for-all/agent-memory-1c16fb47f435/")).toBe("1c16fb47f435");
    expect(mediumPostId("https://medium.com/@tituslhy/agent-memory-1c16fb47f435?source=rss")).toBe("1c16fb47f435");
  });

  it("returns null for a non-Medium host", () => {
    expect(mediumPostId("https://example.com/agent-memory-1c16fb47f435")).toBeNull();
  });

  it("returns null for a look-alike host that merely ends in medium.com", () => {
    expect(mediumPostId("https://notmedium.com/@tituslhy/agent-memory-1c16fb47f435")).toBeNull();
  });

  it("returns null for a Medium path that has no post id suffix", () => {
    expect(mediumPostId("https://medium.com/@tituslhy/just-a-slug")).toBeNull();
  });

  it("returns null when the suffix is shorter than 8 hex characters", () => {
    expect(mediumPostId("https://medium.com/@tituslhy/slug-1c16fb4")).toBeNull();
  });

  it.each([
    ["an unparseable string", "not a url"],
    ["an empty string", ""],
  ])("returns null for %s", (_label, url) => {
    expect(mediumPostId(url)).toBeNull();
  });
});

describe("articleByUrl (injected catalog)", () => {
  it("resolves the @tituslhy form and the publication form of the same article to the same entry", () => {
    expect(articleByUrl(BETA_OWN_URL, CATALOG)).toBe(beta);
    expect(articleByUrl(BETA_PUBLICATION_URL, CATALOG)).toBe(beta);
  });

  it("resolves the catalog's own URL to that article", () => {
    expect(articleByUrl(ALPHA_URL, CATALOG)).toBe(alpha);
  });

  it("returns undefined for a Medium id that is not in the catalog", () => {
    expect(articleByUrl("https://medium.com/@tituslhy/nope-9999ffff0000", CATALOG)).toBeUndefined();
  });

  it("returns undefined for a non-Medium URL, even one ending in a plausible id", () => {
    expect(articleByUrl("https://example.com/alpha-1111aaaa2222", CATALOG)).toBeUndefined();
  });

  it("returns undefined for a malformed URL", () => {
    expect(articleByUrl("not a url", CATALOG)).toBeUndefined();
  });

  it("returns undefined against an empty catalog", () => {
    expect(articleByUrl(ALPHA_URL, [])).toBeUndefined();
  });

  it("keeps the first entry when two catalog articles share a post id", () => {
    const first = article("first-1111aaaa2222", { title: "First" });
    const second = article("second-1111aaaa2222", { title: "Second" });
    expect(articleByUrl(ALPHA_URL, [first, second])?.title).toBe("First");
  });
});

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------

describe("parseCitations", () => {
  const url = ALPHA_URL;

  it("treats an absent field as an empty ledger", () => {
    expect(parseCitations(undefined)).toEqual([]);
  });

  it("accepts an empty array", () => {
    expect(parseCitations([])).toEqual([]);
  });

  it("accepts well-formed entries and returns them in order", () => {
    expect(
      parseCitations([
        { n: 2, url },
        { n: 1, url: BETA_OWN_URL },
      ])
    ).toEqual([
      { n: 2, url },
      { n: 1, url: BETA_OWN_URL },
    ]);
  });

  it("keeps only n and url, so anything else the client sends (such as a title) is dropped", () => {
    expect(parseCitations([{ n: 1, url, title: "Forged headline", publishedAt: "1999-01-01" }])).toEqual([
      { n: 1, url },
    ]);
  });

  it.each([
    ["null", null],
    ["a string", "1,2"],
    ["a number", 3],
    ["an object", { n: 1, url }],
  ])("returns null when citations is %s", (_label, raw) => {
    expect(parseCitations(raw)).toBeNull();
  });

  it("accepts exactly MAX_CITATIONS entries and rejects one more", () => {
    const forty = Array.from({ length: MAX_CITATIONS }, (_, i) => ({ n: i + 1, url }));
    expect(parseCitations(forty)).toHaveLength(MAX_CITATIONS);
    expect(parseCitations([...forty, { n: 41, url }])).toBeNull();
  });

  it.each([
    ["null", null],
    ["a string", "1"],
    ["an empty array", []],
    ["an object without n", { url }],
  ])("returns null when an entry is %s", (_label, entry) => {
    expect(parseCitations([entry])).toBeNull();
  });

  it.each([
    ["zero", 0],
    ["negative", -1],
    ["fractional", 1.5],
    ["a string", "1"],
    ["above 99", 100],
    ["null", null],
  ])("returns null when n is %s", (_label, n) => {
    expect(parseCitations([{ n, url }])).toBeNull();
  });

  it("accepts n at the bounds 1 and 99", () => {
    expect(parseCitations([{ n: 1, url }, { n: 99, url }])).toHaveLength(2);
  });

  it("returns null when url is missing or not a string", () => {
    expect(parseCitations([{ n: 1 }])).toBeNull();
    expect(parseCitations([{ n: 1, url: 42 }])).toBeNull();
  });

  it("accepts a url of exactly 500 characters and rejects 501", () => {
    const pad = "x".repeat(500 - url.length);
    expect(parseCitations([{ n: 1, url: url + pad }])).toHaveLength(1);
    expect(parseCitations([{ n: 1, url: `${url}${pad}x` }])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Resolution against the corpus
// ---------------------------------------------------------------------------

describe("resolveCitations", () => {
  it("returns an empty ledger for an empty request", () => {
    expect(resolveCitations([], CATALOG)).toEqual([]);
  });

  it("drops URLs that are not in the corpus, and keeps the rest", () => {
    const ledger = resolveCitations(
      [
        { n: 1, url: "https://medium.com/@tituslhy/nope-9999ffff0000" },
        { n: 2, url: ALPHA_URL },
        { n: 3, url: "https://example.com/alpha-1111aaaa2222" },
      ],
      CATALOG
    );
    expect(ledger.map((c) => c.n)).toEqual([2]);
    expect(ledger[0].slug).toBe(alpha.slug);
  });

  it("returns nothing when every URL is unknown", () => {
    expect(resolveCitations([{ n: 1, url: "https://medium.com/@tituslhy/nope-9999ffff0000" }], CATALOG)).toEqual([]);
  });

  it("takes title, date and co-authors from the corpus, never from the request", () => {
    const forged = {
      n: 1,
      url: BETA_OWN_URL,
      title: "Forged headline",
      publishedAt: "1999-01-01T00:00:00.000Z",
      coAuthors: ["Mallory"],
    } as unknown as CitationRef;

    const [entry] = resolveCitations([forged], CATALOG);

    expect(entry).toEqual({
      n: 1,
      slug: beta.slug,
      title: "Beta",
      // The corpus records the publication URL, so that is what the ledger carries.
      url: BETA_PUBLICATION_URL,
      publishedAt: "2024-01-02T00:00:00.000Z",
      coAuthors: ["Jane Doe", "John Roe"],
    });
  });

  it("carries no article body", () => {
    const [entry] = resolveCitations([{ n: 1, url: ALPHA_URL }], CATALOG);
    expect(entry).not.toHaveProperty("body");
  });

  it("omits coAuthors for a solo article, and for one with an empty co-author list", () => {
    const ledger = resolveCitations(
      [
        { n: 1, url: ALPHA_URL },
        { n: 2, url: GAMMA_URL },
      ],
      CATALOG
    );
    expect(ledger[0]).not.toHaveProperty("coAuthors");
    expect(ledger[1]).not.toHaveProperty("coAuthors");
  });

  it("keeps the first article when the same number is sent twice", () => {
    const ledger = resolveCitations(
      [
        { n: 3, url: ALPHA_URL },
        { n: 3, url: BETA_OWN_URL },
      ],
      CATALOG
    );
    expect(ledger.map((c) => [c.n, c.slug])).toEqual([[3, alpha.slug]]);
  });

  it("keeps the first number when the same article is sent under two numbers, in either URL form", () => {
    const ledger = resolveCitations(
      [
        { n: 2, url: BETA_PUBLICATION_URL },
        { n: 5, url: BETA_OWN_URL },
      ],
      CATALOG
    );
    expect(ledger.map((c) => [c.n, c.slug])).toEqual([[2, beta.slug]]);
  });

  it("sorts the ledger by number, whatever order the request sent", () => {
    const ledger = resolveCitations(
      [
        { n: 5, url: ALPHA_URL },
        { n: 1, url: BETA_OWN_URL },
        { n: 3, url: GAMMA_URL },
      ],
      CATALOG
    );
    expect(ledger.map((c) => c.n)).toEqual([1, 3, 5]);
  });
});

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

describe("publishedDate", () => {
  it("takes the calendar date from an ISO timestamp", () => {
    expect(publishedDate("2025-06-18T10:00:00.000Z")).toBe("2025-06-18");
  });

  it("returns a date-only string unchanged", () => {
    expect(publishedDate("2025-06-18")).toBe("2025-06-18");
  });
});

describe("formatPublished", () => {
  it("formats the date as 'D Mon YYYY'", () => {
    expect(formatPublished("2025-06-18T10:00:00.000Z")).toBe("18 Jun 2025");
  });

  it("keeps the UTC calendar day for a late-evening timestamp", () => {
    expect(formatPublished("2025-06-18T23:59:59.000Z")).toBe("18 Jun 2025");
  });

  it("does not pad a single-digit day", () => {
    expect(formatPublished("2025-01-02T00:00:00Z")).toBe("2 Jan 2025");
  });

  it("falls back to the raw date text when the date cannot be parsed", () => {
    expect(formatPublished("not-a-date")).toBe("not-a-date");
  });
});

describe("formatToday", () => {
  it("uses the Singapore calendar date, so 17:00 UTC on 13 Nov is already 14 Nov", () => {
    expect(formatToday(new Date("2026-11-13T17:00:00Z"))).toBe("14 Nov 2026");
  });

  it("is still 13 Nov at 23:59:59 in Singapore", () => {
    expect(formatToday(new Date("2026-11-13T15:59:59Z"))).toBe("13 Nov 2026");
  });

  it("turns over to the next day at exactly midnight in Singapore", () => {
    expect(formatToday(new Date("2026-11-13T16:00:00Z"))).toBe("14 Nov 2026");
  });

  it("gives the same day for a midday UTC instant", () => {
    expect(formatToday(new Date("2026-11-14T12:00:00Z"))).toBe("14 Nov 2026");
  });
});

// ---------------------------------------------------------------------------
// The per-request context message
// ---------------------------------------------------------------------------

describe("renderConversationContext", () => {
  const now = new Date("2026-11-13T17:00:00Z");

  it("always opens with today's date, in Singapore time", () => {
    expect(renderConversationContext([], now).split("\n")[0]).toBe("Today's date: 14 Nov 2026.");
    const ledger: PriorCitation[] = [{ n: 1, slug: alpha.slug, title: "Alpha", url: ALPHA_URL, publishedAt: alpha.publishedAt }];
    expect(renderConversationContext(ledger, now).split("\n")[0]).toBe("Today's date: 14 Nov 2026.");
  });

  it("has no ledger section when nothing has been cited", () => {
    const text = renderConversationContext([], now);
    expect(text).toBe("Today's date: 14 Nov 2026.");
    expect(text).not.toContain("already cited");
  });

  it("lists each cited article under its number, with its date and link, and the co-authors when there are some", () => {
    const ledger: PriorCitation[] = [
      { n: 1, slug: alpha.slug, title: "Alpha", url: ALPHA_URL, publishedAt: "2025-06-18T10:00:00.000Z" },
      {
        n: 2,
        slug: beta.slug,
        title: "Beta",
        url: BETA_PUBLICATION_URL,
        publishedAt: "2024-01-02T00:00:00.000Z",
        coAuthors: ["Jane Doe", "John Roe"],
      },
    ];

    expect(renderConversationContext(ledger, now)).toBe(
      [
        "Today's date: 14 Nov 2026.",
        "",
        "Articles of mine already cited in this conversation. Reuse these numbers when you cite them again; search_writing and read_writing return them under the same numbers:",
        `[1] Alpha (published 18 Jun 2025) ${ALPHA_URL}`,
        `[2] Beta (published 2 Jan 2024, co-written with Jane Doe and John Roe) ${BETA_PUBLICATION_URL}`,
      ].join("\n")
    );
  });

  it("names a single co-author without a conjunction", () => {
    const ledger: PriorCitation[] = [
      { n: 1, slug: "x", title: "Joint", url: ALPHA_URL, publishedAt: "2025-06-18T10:00:00.000Z", coAuthors: ["James Koh, PhD"] },
    ];
    const line = renderConversationContext(ledger, now).split("\n").find((l) => l.startsWith("[1]"));
    expect(line).toBe(`[1] Joint (published 18 Jun 2025, co-written with James Koh, PhD) ${ALPHA_URL}`);
  });

  it("adds no co-author phrase for an empty co-author list", () => {
    const ledger: PriorCitation[] = [
      { n: 1, slug: "x", title: "Solo", url: ALPHA_URL, publishedAt: "2025-06-18T10:00:00.000Z", coAuthors: [] },
    ];
    expect(renderConversationContext(ledger, now)).not.toContain("co-written");
  });
});

// ---------------------------------------------------------------------------
// Real corpus
// ---------------------------------------------------------------------------

describe("citation ledger against the real corpus", () => {
  it("resolves a featured mitb-for-all link and its @tituslhy link to the same article", () => {
    const slug = "agent-memory-the-underrated-superpower-of-agentic-apps-1c16fb47f435";
    const publication = `https://medium.com/mitb-for-all/${slug}`;
    const own = `https://medium.com/@tituslhy/${slug}`;

    const fromPublication = articleByUrl(publication);

    expect(fromPublication).toBeDefined();
    expect(fromPublication?.slug).toBe(slug);
    expect(articleByUrl(own)).toBe(fromPublication);
  });

  it("finds every corpus article by its own URL", () => {
    const missed = ARTICLES.filter((a) => articleByUrl(a.url) !== a).map((a) => a.slug);
    expect(missed).toEqual([]);
  });

  it("renders the real co-authored article with its co-author credited", () => {
    const joint = ARTICLES.find((a) => a.coAuthors?.length);
    expect(joint).toBeDefined();

    const ledger = resolveCitations([{ n: 1, url: joint!.url }]);
    const text = renderConversationContext(ledger, new Date("2026-11-13T17:00:00Z"));

    expect(text).toContain(`co-written with ${joint!.coAuthors!.join(" and ")}`);
  });
});

describe("September is written Sep, not Sept", () => {
  it("formats a September publish date as 'D Sep YYYY'", () => {
    expect(formatPublished("2025-09-01T00:00:00Z")).toBe("1 Sep 2025");
  });

  it("formats today in September as 'D Sep YYYY'", () => {
    expect(formatToday(new Date("2026-09-15T12:00:00Z"))).toBe("15 Sep 2026");
  });

  it("never emits 'Sept' in a rendered ledger line", () => {
    const ledger: PriorCitation[] = [
      { n: 1, slug: "x", title: "Autumn", url: ALPHA_URL, publishedAt: "2025-09-30T10:00:00.000Z" },
    ];
    const text = renderConversationContext(ledger, new Date("2026-09-01T12:00:00Z"));
    expect(text).toContain("Today's date: 1 Sep 2026.");
    expect(text).toContain("(published 30 Sep 2025)");
    expect(text).not.toMatch(/Sept\b/);
  });
});

describe("co-author lists", () => {
  it("joins three co-authors as 'A, B and C'", () => {
    const ledger: PriorCitation[] = [
      {
        n: 1,
        slug: "x",
        title: "Trio",
        url: ALPHA_URL,
        publishedAt: "2025-06-18T10:00:00.000Z",
        coAuthors: ["Ada Lovelace", "Grace Hopper", "Alan Turing"],
      },
    ];
    expect(renderConversationContext(ledger, new Date("2026-11-13T17:00:00Z"))).toContain(
      "co-written with Ada Lovelace, Grace Hopper and Alan Turing"
    );
  });
});
