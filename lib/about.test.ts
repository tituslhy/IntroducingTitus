import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  CHAPTERS,
  DEPTH_LABELS,
  TIMELINE_END,
  TIMELINE_START,
  TOOLS,
  TOOL_CATEGORIES,
  atomicNumbers,
  chapterIndexAt,
  depthLabel,
  formatMonth,
  isDailyAt,
  journeyLine,
  monthsBetween,
  photoAt,
  storyAt,
  tableCells,
  toolMatcher,
  type Month,
  type Tool,
} from "./about";

const PUBLIC_DIR = join(__dirname, "..", "public");
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The month after `m`, as "YYYY-MM". */
function monthAfter(m: Month): Month {
  const y = Number(m.slice(0, 4));
  const mo = Number(m.slice(5, 7));
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}

/** A minimal tool for helper tests; only the fields a helper reads matter. */
function makeTool(partial: Partial<Tool> & { name: string; since: Month }): Tool {
  return { category: "lang", logo: "/logos/x.svg", where: "Test", depth: "work", ...partial } as Tool;
}

const find = (name: string): Tool => {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`no tool named ${name}`);
  return tool;
};

describe("formatMonth", () => {
  it("turns YYYY-MM into 'Mon YYYY'", () => {
    expect(formatMonth("2024-08")).toBe("Aug 2024");
    expect(formatMonth("2015-06")).toBe("Jun 2015");
  });

  it("names January and December correctly at the ends of the year", () => {
    expect(formatMonth("2020-01")).toBe("Jan 2020");
    expect(formatMonth("2020-12")).toBe("Dec 2020");
  });
});

describe("monthsBetween", () => {
  it("returns a single month when start equals end", () => {
    expect(monthsBetween("2019-04", "2019-04")).toEqual(["2019-04"]);
  });

  it("rolls over the year boundary without skipping or repeating", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("returns an empty list when end is before start", () => {
    expect(monthsBetween("2026-01", "2025-12")).toEqual([]);
  });

  it("covers the whole timeline inclusively: Jun 2015 to Nov 2026 is 138 months", () => {
    const months = monthsBetween(TIMELINE_START, TIMELINE_END);
    expect(months).toHaveLength(138);
    expect(months[0]).toBe(TIMELINE_START);
    expect(months[months.length - 1]).toBe(TIMELINE_END);
  });

  it("produces zero-padded, consecutive months", () => {
    const months = monthsBetween("2019-10", "2020-03");
    expect(months).toEqual(["2019-10", "2019-11", "2019-12", "2020-01", "2020-02", "2020-03"]);
  });
});

describe("atomicNumbers", () => {
  it("is a permutation of 1..N", () => {
    const numbers = atomicNumbers(TOOLS);
    expect([...numbers].sort((a, b) => a - b)).toEqual(TOOLS.map((_, i) => i + 1));
  });

  it("orders tools by the month they were picked up", () => {
    const numbers = atomicNumbers(TOOLS);
    for (let i = 0; i < TOOLS.length; i++) {
      for (let j = 0; j < TOOLS.length; j++) {
        if (TOOLS[i].since < TOOLS[j].since) expect(numbers[i]).toBeLessThan(numbers[j]);
      }
    }
  });

  it("breaks ties in table order", () => {
    const numbers = atomicNumbers(TOOLS);
    for (let i = 0; i < TOOLS.length; i++) {
      for (let j = i + 1; j < TOOLS.length; j++) {
        if (TOOLS[i].since === TOOLS[j].since) expect(numbers[i]).toBeLessThan(numbers[j]);
      }
    }
    // Excel and VBA were both picked up in Jun 2015 and sit next to each other in the table.
    expect(numbers[TOOLS.indexOf(find("Excel"))]).toBe(1);
    expect(numbers[TOOLS.indexOf(find("VBA"))]).toBe(2);
  });

  it("numbers an earlier-dated tool before a later one even when it comes later in the table", () => {
    const tools = [
      makeTool({ name: "A", since: "2020-02" }),
      makeTool({ name: "B", since: "2019-01" }),
      makeTool({ name: "C", since: "2020-02" }),
    ];
    expect(atomicNumbers(tools)).toEqual([2, 1, 3]);
  });

  it("returns an empty list for no tools", () => {
    expect(atomicNumbers([])).toEqual([]);
  });
});

describe("tableCells", () => {
  const cells = tableCells(TOOLS.length);

  it("gives one cell per tool, all unique", () => {
    expect(cells).toHaveLength(TOOLS.length);
    expect(new Set(cells.map(([c, r]) => `${c},${r}`)).size).toBe(TOOLS.length);
  });

  it("keeps every cell on the 18-column grid, in the six main rows or the detached rows below them (never row 7)", () => {
    for (const [c, r] of cells) {
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(18);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).not.toBe(7);
    }
  });

  it("never places a tool inside the notch (rows 1-3, columns 3-12)", () => {
    for (const [c, r] of cells) {
      const inNotch = r <= 3 && c >= 3 && c <= 12;
      expect({ c, r, inNotch }).toEqual({ c, r, inNotch: false });
    }
  });

  it("leaves row 1 columns 2-12 empty, so the notch has its classic shape", () => {
    for (const [c, r] of cells) {
      if (r === 1) expect(c === 1 || c >= 13).toBe(true);
    }
  });

  it("fills the main six rows first, then puts the overflow in detached rows from row 8 down", () => {
    const main = cells.filter(([, r]) => r <= 6);
    const detached = cells.filter(([, r]) => r >= 8);
    expect(main.length + detached.length).toBe(TOOLS.length);
    expect(cells.slice(0, main.length).every(([, r]) => r <= 6)).toBe(true);
    expect(cells.slice(main.length).every(([, r]) => r >= 8)).toBe(true);
    expect(detached.length).toBeGreaterThan(0);
  });

  it("fills the main rows completely before any detached row (77 cells: 114 tools overflow by 37)", () => {
    const main = cells.filter(([, r]) => r <= 6);
    expect(main).toHaveLength(77);
    expect(TOOLS.length - main.length).toBe(37);
  });

  it("right-aligns the detached rows to the last column", () => {
    const detached = cells.filter(([, r]) => r >= 8);
    for (const row of [8, 9]) {
      const cols = detached.filter(([, r]) => r === row).map(([c]) => c);
      if (cols.length) expect(Math.max(...cols)).toBe(18);
    }
  });

  it("keeps 200 cells unique, on the grid, and out of the notch, well past the old 113 limit", () => {
    const many = tableCells(200);
    expect(many).toHaveLength(200);
    expect(new Set(many.map(([c, r]) => `${c},${r}`)).size).toBe(200);
    for (const [c, r] of many) {
      expect(c).toBeGreaterThanOrEqual(1);
      expect(c).toBeLessThanOrEqual(18);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r <= 3 && c >= 3 && c <= 12).toBe(false);
      expect(r === 1 && c >= 2 && c <= 12).toBe(false);
    }
  });

  it("starts the detached rows at row 8 with each row's last cell in column 18, for 200 cells", () => {
    const many = tableCells(200);
    const main = many.filter(([, r]) => r <= 6);
    const detached = many.slice(main.length);
    expect(detached.length).toBe(200 - main.length);
    expect(detached.every(([, r]) => r >= 8)).toBe(true);
    expect(Math.min(...detached.map(([, r]) => r))).toBe(8);
    const rows = [...new Set(detached.map(([, r]) => r))].sort((a, b) => a - b);
    for (const row of rows) {
      const cols = detached.filter(([, r]) => r === row).map(([c]) => c);
      expect(Math.max(...cols)).toBe(18);
      // Each detached row is one unbroken run of columns ending at 18.
      expect(cols.sort((a, b) => a - b)).toEqual(Array.from({ length: cols.length }, (_, i) => 19 - cols.length + i));
    }
  });

  it("fills columns one at a time, so categories form bands", () => {
    const main = cells.slice(0, 6);
    expect(main).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
      [1, 4],
      [1, 5],
      [1, 6],
    ]);
  });

  it("returns no cells for a count of zero, and the first cell for a count of one", () => {
    expect(tableCells(0)).toEqual([]);
    expect(tableCells(1)).toEqual([[1, 1]]);
  });
});

describe("isDailyAt", () => {
  const python = find("Python"); // daily from 2016-03, still is
  const sql = find("SQL"); // daily 2016-09 to 2026-06, inclusive

  it("is false before a daily span starts and true from its first month (inclusive)", () => {
    expect(isDailyAt(python, "2016-02")).toBe(false);
    expect(isDailyAt(python, "2016-03")).toBe(true);
  });

  it("is true for an open-ended span at any later month", () => {
    expect(isDailyAt(python, "2026-11")).toBe(true);
  });

  it("is true up to and including the last month of a closed span", () => {
    expect(isDailyAt(sql, "2016-08")).toBe(false);
    expect(isDailyAt(sql, "2016-09")).toBe(true);
    expect(isDailyAt(sql, "2026-06")).toBe(true);
    expect(isDailyAt(sql, "2026-07")).toBe(false);
  });

  it("is false for a tool with no daily spans", () => {
    expect(isDailyAt(find("HTML"), "2024-01")).toBe(false);
  });

  it("checks every span, so a tool can be daily in two separate stretches", () => {
    const tool = makeTool({
      name: "Gappy",
      since: "2015-01",
      daily: [
        ["2015-01", "2015-03"],
        ["2016-01", null],
      ],
    });
    expect(isDailyAt(tool, "2015-04")).toBe(false);
    expect(isDailyAt(tool, "2015-03")).toBe(true);
    expect(isDailyAt(tool, "2016-05")).toBe(true);
  });
});

describe("depthLabel", () => {
  it("labels a closed daily span with its years: SQL is 'Every day, 2016–2026'", () => {
    expect(depthLabel(find("SQL"))).toBe("Every day, 2016–2026");
  });

  it("labels an open-ended daily span as plain 'Every day'", () => {
    expect(depthLabel(find("Python"))).toBe("Every day");
    expect(depthLabel(find("Docker"))).toBe(DEPTH_LABELS.daily);
  });

  it("labels a closed daily span on a work tool with its years too", () => {
    expect(depthLabel(find("Excel"))).toBe("Every day, 2015–2017");
  });

  it("falls back to the depth label for tools with no daily span", () => {
    expect(depthLabel(find("HTML"))).toBe("Used at work");
    expect(depthLabel(find("R"))).toBe("Projects only");
  });
});

describe("chapterIndexAt", () => {
  const last = CHAPTERS.length - 1;

  it("maps the first month of the timeline to the first chapter", () => {
    expect(chapterIndexAt(TIMELINE_START)).toBe(0);
    expect(chapterIndexAt("2010-01")).toBe(0);
  });

  it("includes a chapter's own month, and rolls over to the next chapter the month after", () => {
    const i = CHAPTERS.findIndex((c) => c.label === "2017");
    expect(chapterIndexAt(CHAPTERS[i].at)).toBe(i);
    expect(chapterIndexAt(monthAfter(CHAPTERS[i].at))).toBe(i + 1);
  });

  it("puts the months between two chapter stops in the later chapter", () => {
    expect(chapterIndexAt("2015-06")).toBe(0); // the first chapter starts at the timeline start
    expect(chapterIndexAt("2015-07")).toBe(0); // up to 2015–2016 (stop 2016-09)
    expect(chapterIndexAt("2016-09")).toBe(0);
    expect(chapterIndexAt("2016-10")).toBe(1); // 2017 (stop 2017-04)
    expect(chapterIndexAt("2026-07")).toBe(8); // up to 2026 (stop 2026-09)
  });

  it("maps the last month to the last chapter", () => {
    expect(chapterIndexAt(TIMELINE_END)).toBe(last);
    expect(CHAPTERS[last].at).toBe(TIMELINE_END);
  });

  it("falls back to the last chapter for a month past the end", () => {
    expect(chapterIndexAt("2027-01")).toBe(last);
  });
});

describe("storyAt", () => {
  it("returns the text of the chapter the month falls in", () => {
    expect(storyAt(TIMELINE_START)).toBe(CHAPTERS[0].text);
    expect(storyAt("2016-02")).toBe(CHAPTERS[0].text);
    expect(storyAt("2017-02")).toBe(CHAPTERS[1].text);
    expect(storyAt("2021-08")).toBe(CHAPTERS.find((c) => c.label === "2021")!.text);
    expect(storyAt(TIMELINE_END)).toBe(CHAPTERS[CHAPTERS.length - 1].text);
  });

  it("keeps the same story line for every month of a chapter", () => {
    const i = CHAPTERS.findIndex((c) => c.label === "2023");
    for (const m of monthsBetween(monthAfter(CHAPTERS[i - 1].at), CHAPTERS[i].at)) {
      expect(storyAt(m)).toBe(CHAPTERS[i].text);
    }
  });
});

describe("photoAt", () => {
  const photoOf = (label: string) => CHAPTERS.find((c) => c.label === label)!.photo;

  it("has no photo in the 2017 and 2018 chapters, the only ones without one", () => {
    expect(photoAt("2017-04")).toBeUndefined();
    expect(photoAt("2017-05")).toBeUndefined();
    expect(photoAt("2018-04")).toBeUndefined();
  });

  it("shows the 2015–2016 Toyota photo across its chapter, from the start of the timeline", () => {
    expect(photoAt(TIMELINE_START)).toBe(photoOf("2015–2016"));
    expect(photoAt("2016-09")).toBe(photoOf("2015–2016"));
    expect(photoAt(TIMELINE_START)!.src).toBe("/about/toyota.jpg");
    expect(photoAt(TIMELINE_START)!.caption).toBe("Toyota Tsusho, 2015–2017");
  });

  it("shows the same Illumina photo object in the 2023 and 2024 chapters", () => {
    expect(photoOf("2023")!.src).toBe("/about/illumina.jpg");
    expect(photoOf("2024")).toEqual(photoOf("2023"));
    expect(photoAt("2023-12")).toEqual(photoOf("2023"));
    expect(photoAt("2024-06")).toEqual(photoOf("2024"));
    expect(photoAt("2023-06")!.caption).toBe("Illumina, 2023–2025");
  });

  it("shows the UOB photo in the 2025 chapter, before the SMU chapter starts", () => {
    expect(photoAt("2025-09")!.src).toBe("/about/uob.jpg");
    expect(photoAt("2025-09")!.caption).toBe("With my team at UOB");
  });

  it("shows the 2021 photo across its chapter", () => {
    expect(photoAt("2019-01")).toBe(photoOf("2021"));
    expect(photoAt("2021-08")).toBe(photoOf("2021"));
    expect(photoAt("2021-08")!.src).toBe("/about/smu.jpg");
  });

  it("shows the SMU pillar photo, with its link, across the SMU chapter", () => {
    expect(photoAt("2025-10")).toBe(photoOf("SMU"));
    expect(photoAt("2026-06")).toBe(photoOf("SMU"));
    expect(photoAt("2026-06")!.link).toEqual({ label: "Watch the interview", href: "https://youtu.be/SvFH6uKAyfE" });
  });

  it("shows the 2026 and Now photos for their chapters", () => {
    expect(photoAt("2026-07")!.src).toBe("/about/hackathon.jpg");
    expect(photoAt("2026-09")!.src).toBe("/about/hackathon.jpg");
    expect(photoAt("2026-11")!.src).toBe("/about/sff.jpg");
  });
});

describe("toolMatcher", () => {
  it("returns null for a tool that should not be counted", () => {
    expect(toolMatcher(find("Excel"))).toBeNull();
    expect(toolMatcher(find("R"))).toBeNull();
  });

  it("returns the explicit regex when a tool sets one", () => {
    const explicit = find("Java").match;
    expect(explicit).toBeInstanceOf(RegExp);
    expect(toolMatcher(find("Java"))).toBe(explicit);
  });

  it("uses the explicit regex: Java does not match JavaScript", () => {
    const re = toolMatcher(find("Java"))!;
    expect(re.test("I write Java daily")).toBe(true);
    expect(re.test("I write JavaScript daily")).toBe(false);
  });

  it("builds a default whole-word, case-insensitive regex from the name", () => {
    const re = toolMatcher(makeTool({ name: "Flask", since: "2020-01" }))!;
    expect(re).toBeInstanceOf(RegExp);
    expect(re.test("a flask app")).toBe(true);
    expect(re.test("flasks and flasking")).toBe(false);
  });

  it("escapes regex metacharacters in the default name: Next.js does not match NextXjs", () => {
    const re = toolMatcher(makeTool({ name: "Next.js", since: "2020-01" }))!;
    expect(re.test("Built with Next.js")).toBe(true);
    expect(re.test("Built with NextXjs")).toBe(false);
  });

  it("uses the default when the match field is absent, and nothing when it is null", () => {
    expect(toolMatcher(makeTool({ name: "Docker", since: "2020-01" }))).toBeInstanceOf(RegExp);
    expect(toolMatcher(makeTool({ name: "Docker", since: "2020-01", match: null }))).toBeNull();
  });
});

describe("data integrity", () => {
  it("has unique tool names", () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has a grid cell for every tool, with no fixed capacity (detached rows are added as needed)", () => {
    expect(TOOLS.length).toBeGreaterThan(0);
    expect(tableCells(TOOLS.length)).toHaveLength(TOOLS.length);
  });

  it("gives every tool a known category, a non-empty where and a valid depth", () => {
    for (const t of TOOLS) {
      expect(Object.keys(TOOL_CATEGORIES)).toContain(t.category);
      expect(t.where.trim().length).toBeGreaterThan(0);
      expect(["daily", "work", "projects"]).toContain(t.depth);
    }
  });

  it("keeps each category in one contiguous band, in table order", () => {
    const seen: string[] = [];
    for (const t of TOOLS) {
      if (seen[seen.length - 1] !== t.category) {
        expect(seen).not.toContain(t.category);
        seen.push(t.category);
      }
    }
    expect(seen).toEqual(Object.keys(TOOL_CATEGORIES));
  });

  it("points every logo at a file that exists under /public", () => {
    const missing = TOOLS.filter((t) => !t.logo.startsWith("/") || !existsSync(join(PUBLIC_DIR, t.logo))).map(
      (t) => `${t.name}: ${t.logo}`,
    );
    expect(missing).toEqual([]);
  });

  it("gives every 'since' a well-formed month inside the timeline", () => {
    for (const t of TOOLS) {
      expect({ name: t.name, ok: MONTH_RE.test(t.since) }).toEqual({ name: t.name, ok: true });
      expect({ name: t.name, inRange: t.since >= TIMELINE_START && t.since <= TIMELINE_END }).toEqual({
        name: t.name,
        inRange: true,
      });
    }
  });

  it("gives every 'daily' tool at least one daily span", () => {
    const bare = TOOLS.filter((t) => t.depth === "daily" && !(t.daily && t.daily.length)).map((t) => t.name);
    expect(bare).toEqual([]);
  });

  it("keeps every daily span well-formed, inside the timeline, starting no earlier than the tool's 'since'", () => {
    for (const t of TOOLS) {
      let previousEnd: string | null = null;
      for (const [from, to] of t.daily ?? []) {
        expect({ name: t.name, from: MONTH_RE.test(from) }).toEqual({ name: t.name, from: true });
        expect(from >= t.since).toBe(true);
        expect(from >= TIMELINE_START && from <= TIMELINE_END).toBe(true);
        if (to !== null) {
          expect(MONTH_RE.test(to)).toBe(true);
          expect(to >= from).toBe(true);
          expect(to <= TIMELINE_END).toBe(true);
        }
        // Spans are in order and do not overlap.
        if (previousEnd !== null) expect(from > previousEnd).toBe(true);
        previousEnd = to;
      }
    }
  });

  it("keeps chapters sorted by stop month, unique by label, from the timeline start to its end", () => {
    // The first stop is the end of the 2015–2016 chapter; the timeline starts earlier, in Jun 2015.
    expect(CHAPTERS[0].at).toBe("2016-09");
    expect(CHAPTERS[0].at > TIMELINE_START).toBe(true);
    expect(CHAPTERS[CHAPTERS.length - 1].at).toBe(TIMELINE_END);
    const ats = CHAPTERS.map((c) => c.at);
    expect(ats).toEqual([...ats].sort());
    expect(new Set(ats).size).toBe(ats.length);
    const labels = CHAPTERS.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(["2015–2016", "2017", "2018", "2021", "2023", "2024", "2025", "SMU", "2026", "Now"]);
    expect(CHAPTERS).toHaveLength(10);
  });

  it("gives every chapter a well-formed stop month inside the timeline and a non-empty line", () => {
    for (const c of CHAPTERS) {
      expect(MONTH_RE.test(c.at)).toBe(true);
      expect(c.at >= TIMELINE_START && c.at <= TIMELINE_END).toBe(true);
      expect(c.text.trim().length).toBeGreaterThan(0);
    }
  });

  it("gives the eight photo chapters a photo with a file on disk, alt text, a caption and a position", () => {
    expect(CHAPTERS.filter((c) => c.photo).map((c) => c.label)).toEqual([
      "2015–2016",
      "2021",
      "2023",
      "2024",
      "2025",
      "SMU",
      "2026",
      "Now",
    ]);
    for (const c of CHAPTERS.filter((c) => c.photo)) {
      const p = c.photo!;
      expect(existsSync(join(PUBLIC_DIR, p.src))).toBe(true);
      expect(p.alt.trim().length).toBeGreaterThan(0);
      expect(p.caption.trim().length).toBeGreaterThan(0);
      expect(p.position).toMatch(/^\d+% \d+%$/);
    }
  });

  it("links a photo only on the SMU chapter, and only to an https URL", () => {
    const linked = CHAPTERS.filter((c) => c.photo?.link);
    expect(linked.map((c) => c.label)).toEqual(["SMU"]);
    expect(linked[0].photo!.link!.href).toMatch(/^https:\/\//);
  });
});

describe("TypeSafe", () => {
  it("is an every-day tool from 2026-07, still daily at 2026-11", () => {
    const t = find("TypeSafe");
    expect(t.depth).toBe("daily");
    expect(t.daily).toEqual([["2026-07", null]]);
    expect(isDailyAt(t, "2026-11")).toBe(true);
  });

  it("matches 'TypeSafe' but not 'type-safe'", () => {
    const re = toolMatcher(find("TypeSafe"))!;
    expect(re.test("Built on the TypeSafe SDK")).toBe(true);
    expect(re.test("a type-safe client")).toBe(false);
  });
});

describe("IBM ACP", () => {
  it("is in TOOLS with its table logo path", () => {
    const acp = find("IBM ACP");
    expect(acp.logo).toBe("/logos/table/acp.svg");
  });

  it("matches 'Agent Communication Protocol' and 'ACP' but not 'acpi' or 'capacity'", () => {
    const re = toolMatcher(find("IBM ACP"))!;
    expect(re.test("We built agents on the Agent Communication Protocol")).toBe(true);
    expect(re.test("Our ACP gateway")).toBe(true);
    expect(re.test("acpi tables")).toBe(false);
    expect(re.test("increased capacity")).toBe(false);
  });
});

describe("journeyLine", () => {
  it("summarises the default data: two tools from 2015, 'today' at the full count", () => {
    expect(journeyLine()).toBe(`From 2 tools in 2015 to ${TOOLS.length} today.`);
    expect(journeyLine()).toBe("From 2 tools in 2015 to 114 today.");
  });

  it("uses the singular 'tool' when exactly one tool dates from the start year", () => {
    const tools = [makeTool({ name: "A", since: "2015-09" }), makeTool({ name: "B", since: "2016-01" })];
    expect(journeyLine(tools)).toBe("From 1 tool in 2015 to 2 today.");
  });

  it("uses the plural for zero tools from the start year", () => {
    const tools = [makeTool({ name: "A", since: "2016-01" })];
    expect(journeyLine(tools)).toBe("From 0 tools in 2015 to 1 today.");
  });

  it("counts only tools picked up in the start year, and all tools for 'today'", () => {
    const tools = [
      makeTool({ name: "A", since: "2015-06" }),
      makeTool({ name: "B", since: "2015-12" }),
      makeTool({ name: "C", since: "2015-12" }),
      makeTool({ name: "D", since: "2024-03" }),
    ];
    expect(journeyLine(tools)).toBe("From 3 tools in 2015 to 4 today.");
  });

  it("handles an empty list", () => {
    expect(journeyLine([])).toBe("From 0 tools in 2015 to 0 today.");
  });
});

describe("pillar photo", () => {
  it("is the SMU chapter's photo, shown from the start of that chapter", () => {
    const smu = CHAPTERS.find((c) => c.label === "SMU")!;
    expect(smu.photo!.src).toBe("/about/pillar.jpg");
    expect(smu.photo!.link).toEqual({ label: "Watch the interview", href: "https://youtu.be/SvFH6uKAyfE" });
    expect(photoAt("2025-09")).not.toBe(smu.photo);
    expect(photoAt("2025-10")).toBe(smu.photo);
  });
});
