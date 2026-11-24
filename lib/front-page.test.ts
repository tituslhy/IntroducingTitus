import articleThemes from "@/content/article-themes.json";
import githubMeta from "@/content/github-meta.json";
import { ARTICLE_COUNT_NUMBER, numberToWords } from "./content";
import { FEATURED_ROLE_COUNT, OPEN_SOURCE, PROJECTS, ROLES, type Role } from "./profile";
import {
  FRONT_STATS,
  aboutBio,
  capitalise,
  experienceDoor,
  projectsDoor,
  roleDuration,
  themeCounts,
} from "./front-page";

describe("roleDuration", () => {
  it("says now for a role that is still running", () => {
    expect(roleDuration("Jul 2026 — Present")).toBe("now");
  });

  it("matches Present without regard to case", () => {
    expect(roleDuration("Jul 2026 — present")).toBe("now");
  });

  it("gives 13 months as 1 yr (rounded to the nearest half year)", () => {
    expect(roleDuration("Jun 2025 — Jul 2026")).toBe("1 yr");
  });

  it("gives 29 months as 2.5 yrs", () => {
    expect(roleDuration("Jan 2023 — Jun 2025")).toBe("2.5 yrs");
  });

  it("gives exactly 12 months as 1 yr, singular", () => {
    expect(roleDuration("Jan 2024 — Jan 2025")).toBe("1 yr");
  });

  it("uses a plural for 1.5 and longer", () => {
    expect(roleDuration("Jan 2024 — Jul 2025")).toBe("1.5 yrs");
    expect(roleDuration("Jan 2015 — Jan 2025")).toBe("10 yrs");
  });

  it("gives a role under a year in months, plural", () => {
    expect(roleDuration("Sep 2022 — Jan 2023")).toBe("4 mos");
  });

  it("uses the singular for exactly one month", () => {
    expect(roleDuration("Apr 2017 — May 2017")).toBe("1 mo");
  });

  it("gives 0 months, plural, for a role that starts and ends in the same month", () => {
    expect(roleDuration("Apr 2017 — Apr 2017")).toBe("0 mos");
  });

  it("accepts en dashes, em dashes and hyphens between the dates", () => {
    expect(roleDuration("Jan 2023 – Jun 2025")).toBe("2.5 yrs");
    expect(roleDuration("Jan 2023 - Jun 2025")).toBe("2.5 yrs");
    expect(roleDuration("Jan 2023 — Jun 2025")).toBe("2.5 yrs");
  });

  it("accepts full month names", () => {
    expect(roleDuration("January 2024 — March 2024")).toBe("2 mos");
  });

  it("returns an empty string when the end date is before the start date", () => {
    expect(roleDuration("Jun 2025 — Jan 2023")).toBe("");
  });

  it("returns an empty string for a date range that is not month and year", () => {
    expect(roleDuration("2021 — 2022")).toBe("");
    expect(roleDuration("Foo 2022 — Jan 2023")).toBe("");
  });

  it("gives the same answer for every real role in ROLES that ends in a month", () => {
    for (const r of ROLES) {
      const d = roleDuration(r.dates);
      if (/present/i.test(r.dates)) expect(d).toBe("now");
      else expect(d).toMatch(/^(\d+ mos?|\d+(\.5)? yrs?)$/);
    }
  });
});

describe("FRONT_STATS", () => {
  it("spells the years out in words, capitalised: Eight", () => {
    expect(FRONT_STATS.yearsWord).toBe("Eight");
  });

  it("takes the article count from the canonical number", () => {
    expect(FRONT_STATS.articles).toBe(ARTICLE_COUNT_NUMBER);
  });

  it("takes the public repo count from content/github-meta.json", () => {
    expect(FRONT_STATS.repos).toBe(githubMeta.publicRepos);
  });

  it("counts the open-source contributions from the OPEN_SOURCE list", () => {
    expect(FRONT_STATS.contributions).toBe(OPEN_SOURCE.length);
  });
});

describe("capitalise", () => {
  it("upper-cases only the first letter", () => {
    expect(capitalise("eight")).toBe("Eight");
    expect(capitalise("sixty five")).toBe("Sixty five");
  });

  it("is safe on an empty string", () => {
    expect(capitalise("")).toBe("");
  });
});

describe("experienceDoor", () => {
  it("shows FEATURED_ROLE_COUNT role rows, then one '+ N earlier roles' row for the rest", () => {
    const { rows } = experienceDoor();
    const earlier = ROLES.length - FEATURED_ROLE_COUNT;
    expect(rows).toHaveLength(FEATURED_ROLE_COUNT + 1);
    expect(rows.slice(0, FEATURED_ROLE_COUNT).map((r) => r.lead)).toEqual(
      ROLES.slice(0, FEATURED_ROLE_COUNT).map((r) => r.years),
    );
    expect(rows[FEATURED_ROLE_COUNT]).toMatchObject({
      text: `+ ${numberToWords(earlier)} earlier role${earlier === 1 ? "" : "s"}`,
      lead: ROLES[ROLES.length - 1].years,
      end: "see all →",
    });
  });

  it("shows the latest three roles, then one row for the rest", () => {
    const { rows } = experienceDoor();
    expect(rows).toHaveLength(4);
    expect(rows.slice(0, 3).map((r) => r.text)).toEqual([
      `${ROLES[0].role}, ${ROLES[0].company}`,
      `VP, Generative AI, ${ROLES[1].company}`,
      `${ROLES[2].role}, ${ROLES[2].company}`,
    ]);
  });

  it("marks the current role as now, in the amber style", () => {
    const [current] = experienceDoor().rows;
    expect(current.end).toBe("now");
    expect(current.current).toBe(true);
  });

  it("gives the other latest roles their duration, not marked as current", () => {
    const [, uob, illumina] = experienceDoor().rows;
    expect(uob).toMatchObject({ end: "1 yr", current: false });
    expect(illumina).toMatchObject({ end: "2.5 yrs", current: false });
  });

  it("counts the earlier roles in words, and points to the full list", () => {
    const earlier = ROLES.length - 3;
    const last = experienceDoor().rows[3];
    expect(earlier).toBe(4);
    expect(last.text).toBe("+ four earlier roles");
    expect(last.end).toBe("see all →");
    expect(last.lead).toBe(ROLES[ROLES.length - 1].years);
  });

  it("states the total role count in words in the deck", () => {
    const { deck } = experienceDoor();
    expect(deck).toBe(`Seven roles, from supply-chain forecasting to leading AI engineering.`);
  });

  it("shortens Vice President to VP in the preview only", () => {
    const vp = experienceDoor().rows[1].text;
    expect(vp.startsWith("VP, ")).toBe(true);
    expect(ROLES[1].role.startsWith("Vice President")).toBe(true);
  });

  describe("with a short list of roles", () => {
    const role = (over: Partial<Role>): Role =>
      ({
        slug: "x",
        years: "2020",
        company: "Acme",
        location: "Singapore",
        role: "Engineer",
        dates: "Jan 2020 — Jan 2021",
        deck: "",
        tech: [],
        ...over,
      }) as Role;

    it("shows no earlier-roles row when there are three or fewer roles", () => {
      const roles = [role({ dates: "Jan 2020 — Present" }), role({}), role({})];
      const { rows, deck } = experienceDoor(roles);
      expect(rows).toHaveLength(3);
      expect(rows.some((r) => r.text.startsWith("+"))).toBe(false);
      expect(deck.startsWith("Three roles")).toBe(true);
    });

    it("uses the singular for exactly one earlier role", () => {
      const roles = [role({}), role({}), role({}), role({ years: "2010" })];
      const { rows } = experienceDoor(roles);
      expect(rows[3]).toMatchObject({ text: "+ one earlier role", end: "see all →", lead: "2010" });
    });

    it("gives a current role marked Present as now", () => {
      const { rows } = experienceDoor([role({ dates: "Jan 2024 — Present" })]);
      expect(rows[0]).toMatchObject({ end: "now", current: true });
    });
  });
});

describe("projectsDoor", () => {
  it("has one row per entry in PROJECTS, led by its key figure", () => {
    const rows = projectsDoor();
    expect(rows).toHaveLength(PROJECTS.length);
    rows.forEach((row, i) => expect(row.lead).toBe(PROJECTS[i].figure.value));
  });

  it("describes each project as title: preview", () => {
    const rows = projectsDoor();
    expect(rows[0].text).toBe(`${PROJECTS[0].title}: ${PROJECTS[0].preview}`);
  });

  it("says GitHub for a project with a public repo, and work for one without", () => {
    const rows = projectsDoor();
    PROJECTS.forEach((p, i) => {
      expect(rows[i].end).toBe(p.github ? "GitHub" : "work");
    });
    const illumina = rows.find((r) => r.text.startsWith("Illumina Agentic RAG"));
    expect(illumina?.end).toBe("work");
    const bassoon = rows.find((r) => r.text.startsWith("fictional-bassoon"));
    expect(bassoon?.end).toBe("GitHub");
  });
});

describe("themeCounts", () => {
  it("returns one chip per theme that has articles, most articles first", () => {
    const counts = themeCounts();
    expect(counts.length).toBeGreaterThan(0);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i - 1].count).toBeGreaterThanOrEqual(counts[i].count);
    }
  });

  it("counts each article once, under the first theme it is filed in", () => {
    const assigned = Object.values(articleThemes.assignments as Record<string, string[]>);
    const known = new Set(articleThemes.themes.map((t) => t.id));
    expect(assigned.every((ids) => ids.length === 1 || ids.length === 2)).toBe(true);
    expect(assigned.every((ids) => ids.every((id) => known.has(id)))).toBe(true);

    // Only the first theme of each article is counted; a second theme never adds to a chip.
    const expected = new Map<string, number>();
    for (const ids of assigned) expected.set(ids[0], (expected.get(ids[0]) ?? 0) + 1);

    for (const chip of themeCounts()) {
      expect(chip.count).toBe(expected.get(chip.id));
    }
  });

  it("ignores second themes: a two-theme article adds to its first theme's count only", () => {
    jest.isolateModules(() => {
      jest.doMock("@/content/article-themes.json", () => ({
        themes: [
          { id: "a", name: "Alpha" },
          { id: "b", name: "Beta" },
        ],
        assignments: { "post-1": ["a", "b"], "post-2": ["b"] },
      }));
      const { themeCounts: counts } = jest.requireActual<typeof import("./front-page")>("./front-page");
      // If post-1 were also counted under Beta, Beta would show 2.
      expect(counts()).toEqual([
        { id: "a", name: "Alpha", count: 1 },
        { id: "b", name: "Beta", count: 1 },
      ]);
    });
    jest.dontMock("@/content/article-themes.json");
  });

  it("gives chips that add up to the article count, with no article counted twice", () => {
    const total = themeCounts().reduce((sum, t) => sum + t.count, 0);
    expect(total).toBe(Object.keys(articleThemes.assignments).length);
  });

  it("has one chip for each of the ten themes, since each now has articles", () => {
    expect(themeCounts()).toHaveLength(10);
    expect(themeCounts().map((t) => t.name).sort()).toEqual([
      "Agent Applications",
      "Agent Frameworks",
      "Agent Patterns & Protocols",
      "Blockchain",
      "Copilots",
      "Evaluating & Testing Agents",
      "RAG Applications",
      "Software Engineering",
      "Training LLMs",
      "Working Life",
    ]);
  });

  it("shortens the long theme names for the chips", () => {
    const names = themeCounts().map((t) => t.name);
    expect(names).toContain("Agent Patterns & Protocols");
    expect(names).toContain("Evaluating & Testing Agents");
    names.forEach((n) => {
      expect(n).not.toMatch(/ and | Application /);
    });
  });

  it("leaves out a theme that has no articles", () => {
    jest.isolateModules(() => {
      jest.doMock("@/content/article-themes.json", () => ({
        themes: [
          { id: "a", name: "Alpha" },
          { id: "empty", name: "Nothing yet" },
          { id: "b", name: "Beta" },
        ],
        assignments: { "post-1": ["a"], "post-2": ["b"], "post-3": ["b"] },
      }));
      const { themeCounts: counts } = jest.requireActual<typeof import("./front-page")>("./front-page");
      expect(counts()).toEqual([
        { id: "b", name: "Beta", count: 2 },
        { id: "a", name: "Alpha", count: 1 },
      ]);
    });
    jest.dontMock("@/content/article-themes.json");
  });

  it("maps Application to App and and to & in the name", () => {
    jest.isolateModules(() => {
      jest.doMock("@/content/article-themes.json", () => ({
        themes: [{ id: "t", name: "Model Application and Ops" }],
        assignments: { p: ["t"] },
      }));
      const { themeCounts: counts } = jest.requireActual<typeof import("./front-page")>("./front-page");
      expect(counts()[0].name).toBe("Model App & Ops");
    });
    jest.dontMock("@/content/article-themes.json");
  });
});

describe("aboutBio", () => {
  it("names the undergraduate and master's study, with the GPA from EDUCATION", () => {
    const bio = aboutBio();
    expect(bio).toContain("NUS chemical engineering");
    expect(bio).toContain("a Master's in AI at SMU");
    expect(bio).toContain("(GPA 3.98/4.0)");
  });

  it("reads as two sentences", () => {
    const sentences = aboutBio().split(/(?<=\.)\s+/);
    expect(sentences).toHaveLength(2);
  });

  it("leaves the GPA out when EDUCATION has none", () => {
    jest.isolateModules(() => {
      jest.doMock("./profile", () => ({
        EDUCATION: [{ slug: "x", standing: { figure: "2nd Upper", caption: "Class Honours" }, scholarships: ["Dean's List"] }],
        OPEN_SOURCE: [],
        PROJECTS: [],
        ROLES: [],
      }));
      const { aboutBio: bio } = jest.requireActual<typeof import("./front-page")>("./front-page");
      expect(bio()).not.toContain("GPA");
      expect(bio()).toContain("NUS chemical engineering");
    });
    jest.dontMock("./profile");
  });
});
