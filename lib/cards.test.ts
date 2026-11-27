import type { AgentToRendererMessage } from "@a2ui/web_core/v1_0";
import * as cardsModule from "./cards";
import {
  MAX_CELL_CHARS,
  MAX_LABEL_CHARS,
  MAX_LINE_CHARS,
  MAX_NAME_CHARS,
  MAX_OPTIONS,
  MAX_PLACES,
  MAX_ROWS,
  MAX_SOURCES,
  MAX_TITLE_CHARS,
  MIN_PLACES,
  PLACE_TARGET_IDS,
  SHOW_CARD_PARAMETERS,
  buildCard,
  checkMessages,
  cleanText,
  deskOf,
  monthYear,
  parseShowCardArgs,
  type ShowCardArgs,
} from "./cards";
import { ARTICLES, type Article } from "./articles";
import { mediumPostId } from "./citation-ledger";
import { EDUCATION, PAGE_TARGETS, PROJECTS, ROLES } from "./profile";
import { BASIC_CATALOG_ID, TITUS_CATALOG_ID } from "./a2ui-catalog";

// Real articles from my corpus, found by title (the ids are the Medium post ids, which the model writes).
const byTitle = (re: RegExp): Article => {
  const found = ARTICLES.find((a) => re.test(a.title));
  if (!found) throw new Error(`fixture missing: ${re}`);
  return found;
};
const RAFT = byTitle(/How to RAFT your LLM/);
const BOUNCER = byTitle(/Needs a Bouncer/);
const MULTI_AGENT = byTitle(/A field guide to multi-agent architectures/);
const GRPO = byTitle(/How to train your LLM to reason/);
const CO_AUTHORED = byTitle(/A Second Note on Claude Code/);
const pid = (a: Article) => mediumPostId(a.url)!;

const role = (slug: string) => ROLES.find((r) => r.slug === slug)!;
const project = (slug: string) => PROJECTS.find((p) => p.slug === slug)!;

type Comp = { id: string; component: string; [k: string]: unknown };
const componentsOf = (messages: AgentToRendererMessage[]): Comp[] =>
  messages.flatMap((m) => (m as { updateComponents?: { components: Comp[] } }).updateComponents?.components ?? []);
const withComponent = (messages: AgentToRendererMessage[], name: string) => componentsOf(messages).filter((c) => c.component === name);
/** Every piece of text a card shows, as a list. */
const textsOf = (messages: AgentToRendererMessage[]) =>
  componentsOf(messages).flatMap((c) => (typeof c.text === "string" ? [c.text] : []));
const linkUrls = (messages: AgentToRendererMessage[]) =>
  componentsOf(messages).flatMap((c) => {
    const call = (c.action as { functionCall?: { "@call"?: string; args?: { url?: string } } } | undefined)?.functionCall;
    return call?.["@call"] === "openUrl" ? [call.args!.url!] : [];
  });
const showOnPageTargets = (messages: AgentToRendererMessage[]) =>
  componentsOf(messages).flatMap((c) => {
    const call = (c.action as { functionCall?: { "@call"?: string; args?: { target?: string } } } | undefined)?.functionCall;
    return call?.["@call"] === "showOnPage" ? [call.args!.target!] : [];
  });

/** Article number lookup for buildCard: the conversation has numbered these articles, by slug. */
const numbered = (map: Record<string, number>) => (slug: string) => map[slug];

const evidence = (overrides: Partial<Extract<ShowCardArgs, { kind: "evidence" }>> = {}): ShowCardArgs => ({
  kind: "evidence",
  places: [
    { target: "role-illumina", line: "Built the RAG stack" },
    { target: "project-margin-call", line: "Side project on agents" },
  ],
  articles: [],
  ...overrides,
});

const compare = (overrides: Partial<Extract<ShowCardArgs, { kind: "compare" }>> = {}): ShowCardArgs => ({
  kind: "compare",
  title: "LoRA, RAFT or GRPO",
  options: [
    { name: "LoRA", article: null },
    { name: "RAFT", article: pid(RAFT) },
    { name: "GRPO", article: pid(GRPO) },
  ],
  rows: [{ label: "Trains on", cells: ["Adapters", "Docs and answers", "Rewards"] }],
  ...overrides,
});

const ok = (result: ReturnType<typeof buildCard>) => {
  if (!result.ok) throw new Error(`expected a card, got error: ${result.error}`);
  return result.card;
};

// ---------------------------------------------------------------------------
// cleanText
// ---------------------------------------------------------------------------

describe("cleanText", () => {
  it("returns plain text trimmed, with runs of spaces collapsed", () => {
    expect(cleanText("  Solo   agents\n\tare  simple  ", 100)).toBe("Solo agents are simple");
  });

  it("returns null for a non-string, a blank string and whitespace only", () => {
    expect(cleanText(42, 100)).toBeNull();
    expect(cleanText(null, 100)).toBeNull();
    expect(cleanText(undefined, 100)).toBeNull();
    expect(cleanText("", 100)).toBeNull();
    expect(cleanText("   \n ", 100)).toBeNull();
  });

  it("keeps text exactly at the cap, unchanged", () => {
    const text = "a".repeat(20);
    expect(cleanText(text, 20)).toBe(text);
  });

  it("cuts long text at a word boundary, with an ellipsis, never over the cap", () => {
    const out = cleanText("one two three four five six seven eight nine ten", 20)!;
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(20);
    // The kept part is whole words from the start of the text.
    expect("one two three four five six seven eight nine ten".startsWith(out.slice(0, -1))).toBe(true);
    expect(out).toBe("one two three four…");
  });

  it("cuts mid-word when there is no space in the first half of the cap", () => {
    const out = cleanText("supercalifragilisticexpialidocious", 10)!;
    expect(out).toBe("supercali…");
    expect(out.length).toBe(10);
  });

  it("drops trailing punctuation before the ellipsis", () => {
    expect(cleanText("one two, three four", 10)).toBe("one two…");
  });

  it.each([
    ["an https link", "read https://medium.com/@tituslhy/x"],
    ["a bare www address", "see www.example.org"],
    ["a bare domain", "see example.com for more"],
    ["an html tag", "a <b>bold</b> claim"],
    ["a closing tag", "wrap in </div>"],
    ["a markdown link", "see [this](https://x.y)"],
    ["a javascript: url", "click javascript:alert(1)"],
  ])("rejects text with %s, returning null", (_label, raw) => {
    expect(cleanText(raw, 200)).toBeNull();
  });

  it("does not reject ordinary prose with dots and angle-free words", () => {
    expect(cleanText("Good for RAG. Cheap to run.", 200)).toBe("Good for RAG. Cheap to run.");
  });
});

// ---------------------------------------------------------------------------
// The exports the card kinds depend on
// ---------------------------------------------------------------------------

describe("cards exports", () => {
  it("names the place targets from the site's roles, projects and schools, and nothing else", () => {
    const expected = [
      ...ROLES.map((r) => `role-${r.slug}`),
      ...PROJECTS.map((p) => `project-${p.slug}`),
      ...EDUCATION.map((e) => `edu-${e.slug}`),
    ];
    expect(PLACE_TARGET_IDS).toEqual(expected);
    expect(PLACE_TARGET_IDS).toContain("role-illumina");
    expect(PLACE_TARGET_IDS).toContain("project-margin-call");
    expect(PLACE_TARGET_IDS).toContain("edu-smu");
    expect(PLACE_TARGET_IDS).not.toContain("writing");
  });

  it("has the evidence caps: a line of 48 characters, up to 4 places and 5 sources", () => {
    expect(MAX_LINE_CHARS).toBe(48);
    expect(MAX_PLACES).toBe(4);
    expect(MAX_SOURCES).toBe(5);
  });

  it("no longer exports the reading list's caps", () => {
    const names = Object.keys(cardsModule);
    expect(names).not.toContain("MAX_WHY_CHARS");
    expect(names).not.toContain("MAX_READING_LIST");
  });
});

// ---------------------------------------------------------------------------
// parseShowCardArgs: evidence
// ---------------------------------------------------------------------------

const raw = (card: unknown) => JSON.stringify({ card });

describe("parseShowCardArgs: evidence", () => {
  it("returns the places in the order given, with the target and the line kept", () => {
    const out = parseShowCardArgs(
      raw({
        kind: "evidence",
        places: [
          { target: "role-illumina", line: "Built the RAG stack" },
          { target: "project-margin-call", line: "Side project on agents" },
        ],
        articles: [],
      })
    );
    expect(out).toEqual({
      kind: "evidence",
      places: [
        { target: "role-illumina", line: "Built the RAG stack" },
        { target: "project-margin-call", line: "Side project on agents" },
      ],
      articles: [],
    });
  });

  it("trims the target and collapses the spaces in the line", () => {
    const out = parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "  role-uob ", line: "  Tested,   then\nred-teamed " }], articles: [] }));
    expect(out).toEqual({ kind: "evidence", places: [{ target: "role-uob", line: "Tested, then red-teamed" }], articles: [] });
  });

  it("accepts one to four places, and rejects none or five", () => {
    const place = (i: number) => ({ target: `role-${i}`, line: `Line ${i}` });
    const many = (n: number) => Array.from({ length: n }, (_, i) => place(i));
    expect(parseShowCardArgs(raw({ kind: "evidence", places: many(1), articles: [] }))).not.toBeNull();
    expect(parseShowCardArgs(raw({ kind: "evidence", places: many(MAX_PLACES), articles: [] }))).not.toBeNull();
    expect(MAX_PLACES).toBe(4);
    expect(parseShowCardArgs(raw({ kind: "evidence", places: many(MAX_PLACES + 1), articles: [] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "evidence", places: [], articles: [] }))).toBeNull();
  });

  it("drops a repeated target, keeping its first line", () => {
    const out = parseShowCardArgs(
      raw({
        kind: "evidence",
        places: [
          { target: "role-illumina", line: "first" },
          { target: "role-uob", line: "second" },
          { target: "role-illumina", line: "again" },
        ],
        articles: [],
      })
    );
    expect(out).toEqual({
      kind: "evidence",
      places: [
        { target: "role-illumina", line: "first" },
        { target: "role-uob", line: "second" },
      ],
      articles: [],
    });
  });

  it("rejects the whole card when a place has no target, a blank target, or a non-string target", () => {
    expect(parseShowCardArgs(raw({ kind: "evidence", places: [{ line: "x" }], articles: [] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "   ", line: "x" }], articles: [] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "evidence", places: [{ target: 7, line: "x" }], articles: [] }))).toBeNull();
  });

  it("rejects the whole card when a line is blank, unsafe, or missing", () => {
    expect(parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "role-uob", line: "  " }], articles: [] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "role-uob", line: "see https://x.com" }], articles: [] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "role-uob", line: "<b>bold</b>" }], articles: [] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "role-uob" }], articles: [] }))).toBeNull();
    expect(
      parseShowCardArgs(
        raw({
          kind: "evidence",
          places: [
            { target: "role-illumina", line: "fine" },
            { target: "role-uob", line: "[docs](https://x.y)" },
          ],
          articles: [],
        })
      )
    ).toBeNull();
  });

  it("cuts an overlong line to its cap with an ellipsis, rather than rejecting the card", () => {
    const line = "Built the whole retrieval stack for the team, end to end, including evaluation and the on-call rota.";
    const out = parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "role-illumina", line }], articles: [] })) as Extract<
      ShowCardArgs,
      { kind: "evidence" }
    >;
    expect(out).not.toBeNull();
    expect(out.places[0].line.length).toBeLessThanOrEqual(MAX_LINE_CHARS);
    expect(out.places[0].line.endsWith("…")).toBe(true);
  });

  it("keeps an unknown target as the model wrote it: buildCard, not the parser, drops it", () => {
    const out = parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "role-nasa", line: "x" }], articles: [] }));
    expect(out).toEqual({ kind: "evidence", places: [{ target: "role-nasa", line: "x" }], articles: [] });
  });

  it("reduces article ids to their lowercase Medium post id, from a full URL or as written", () => {
    const out = parseShowCardArgs(
      raw({ kind: "evidence", places: [{ target: "role-illumina", line: "x" }], articles: [RAFT.url, ` ${pid(BOUNCER).toUpperCase()} `] })
    ) as Extract<ShowCardArgs, { kind: "evidence" }>;
    expect(out.articles).toEqual([pid(RAFT), pid(BOUNCER)]);
  });

  it("drops a repeated article and a non-string article, keeping the first position", () => {
    const out = parseShowCardArgs(
      raw({
        kind: "evidence",
        places: [{ target: "role-illumina", line: "x" }],
        articles: [pid(RAFT), 42, pid(BOUNCER), pid(RAFT)],
      })
    ) as Extract<ShowCardArgs, { kind: "evidence" }>;
    expect(out.articles).toEqual([pid(RAFT), pid(BOUNCER)]);
  });

  it("accepts zero to five articles, and rejects six", () => {
    const place = [{ target: "role-illumina", line: "x" }];
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `id${i}aaaaaaa`);
    expect(MAX_SOURCES).toBe(5);
    expect(parseShowCardArgs(raw({ kind: "evidence", places: place, articles: [] }))).not.toBeNull();
    expect(parseShowCardArgs(raw({ kind: "evidence", places: place, articles: ids(MAX_SOURCES) }))).not.toBeNull();
    expect(parseShowCardArgs(raw({ kind: "evidence", places: place, articles: ids(MAX_SOURCES + 1) }))).toBeNull();
  });

  it("rejects an evidence card with no articles key at all", () => {
    expect(parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "role-illumina", line: "x" }] }))).toBeNull();
  });

  it("caps an article id at 64 characters", () => {
    const out = parseShowCardArgs(raw({ kind: "evidence", places: [{ target: "role-illumina", line: "x" }], articles: ["a".repeat(100)] })) as Extract<
      ShowCardArgs,
      { kind: "evidence" }
    >;
    expect(out.articles[0]).toHaveLength(64);
  });
});

// ---------------------------------------------------------------------------
// parseShowCardArgs: compare
// ---------------------------------------------------------------------------

describe("parseShowCardArgs: slugs that end in an article id", () => {
  it("resolves an evidence article written as a slug to its post id", () => {
    const out = parseShowCardArgs(
      raw({ kind: "evidence", places: [{ target: "role-illumina", line: "x" }], articles: ["introducing-stablecoins-1a2b3c4d5e6f"] })
    ) as Extract<ShowCardArgs, { kind: "evidence" }>;
    expect(out.articles).toEqual(["1a2b3c4d5e6f"]);
  });

  it("resolves a compare option's article written as a slug to its post id", () => {
    const out = parseShowCardArgs(
      raw({
        kind: "compare",
        title: "T",
        options: [{ name: "A", article: null }, { name: "B", article: "introducing-stablecoins-1a2b3c4d5e6f" }],
        rows: [{ label: "L", cells: ["x", "y"] }],
      })
    ) as Extract<ShowCardArgs, { kind: "compare" }>;
    expect(out.options[1].article).toBe("1a2b3c4d5e6f");
  });
});

describe("parseShowCardArgs: compare", () => {
  const options = [
    { name: "LoRA", article: null },
    { name: "RAFT", article: pid(RAFT) },
  ];

  it("returns the title, options and rows in the order given", () => {
    const out = parseShowCardArgs(
      raw({
        kind: "compare",
        title: "LoRA or RAFT",
        options,
        rows: [
          { label: "Trains on", cells: ["Adapters", "Docs"] },
          { label: "Good for", cells: ["Style", "Facts"] },
        ],
      })
    );
    expect(out).toEqual({
      kind: "compare",
      title: "LoRA or RAFT",
      options: [
        { name: "LoRA", article: null },
        { name: "RAFT", article: pid(RAFT) },
      ],
      rows: [
        { label: "Trains on", cells: ["Adapters", "Docs"] },
        { label: "Good for", cells: ["Style", "Facts"] },
      ],
    });
  });

  it("treats a missing article as null", () => {
    const out = parseShowCardArgs(raw({ kind: "compare", title: "T", options: [{ name: "A" }, { name: "B" }], rows: [{ label: "L", cells: ["x", "y"] }] })) as Extract<ShowCardArgs, { kind: "compare" }>;
    expect(out.options).toEqual([
      { name: "A", article: null },
      { name: "B", article: null },
    ]);
  });

  it("accepts two or three options, and rejects one or four", () => {
    const row = { label: "L", cells: ["x", "y", "z"] };
    const three = [{ name: "A", article: null }, { name: "B", article: null }, { name: "C", article: null }];
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options: three, rows: [row] }))).not.toBeNull();
    expect(MAX_OPTIONS).toBe(3);
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options: [three[0]], rows: [{ label: "L", cells: ["x"] }] }))).toBeNull();
    const four = [...three, { name: "D", article: null }];
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options: four, rows: [{ label: "L", cells: ["a", "b", "c", "d"] }] }))).toBeNull();
  });

  it("accepts one to four rows, and rejects none or five", () => {
    const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `Row ${i}`, cells: ["a", "b"] }));
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: rows(1) }))).not.toBeNull();
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: rows(MAX_ROWS) }))).not.toBeNull();
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: rows(MAX_ROWS + 1) }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: [] }))).toBeNull();
  });

  it("rejects a row whose cell count does not match the options", () => {
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: [{ label: "L", cells: ["only one"] }] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: [{ label: "L", cells: ["a", "b", "c"] }] }))).toBeNull();
  });

  it("rejects the whole card when a cell or a label is blank or unsafe", () => {
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: [{ label: "L", cells: ["a", "   "] }] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: [{ label: "L", cells: ["a", "see www.x.io"] }] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: [{ label: "<b>L</b>", cells: ["a", "b"] }] }))).toBeNull();
  });

  it("rejects a blank or unsafe option name, title, or missing cells array", () => {
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options: [{ name: " ", article: null }, { name: "B", article: null }], rows: [{ label: "L", cells: ["a", "b"] }] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "compare", title: "see https://x.y", options, rows: [{ label: "L", cells: ["a", "b"] }] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "compare", title: "", options, rows: [{ label: "L", cells: ["a", "b"] }] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "compare", title: "T", options, rows: [{ label: "L" }] }))).toBeNull();
  });

  it("cuts an overlong title, name, label and cell to their caps", () => {
    const long = "word ".repeat(60);
    const out = parseShowCardArgs(
      raw({
        kind: "compare",
        title: long,
        options: [{ name: long, article: null }, { name: "B", article: null }],
        rows: [{ label: long, cells: [long, "b"] }],
      })
    ) as Extract<ShowCardArgs, { kind: "compare" }>;
    expect(out.title.length).toBeLessThanOrEqual(MAX_TITLE_CHARS);
    expect(out.options[0].name.length).toBeLessThanOrEqual(MAX_NAME_CHARS);
    expect(out.rows[0].label.length).toBeLessThanOrEqual(MAX_LABEL_CHARS);
    expect(out.rows[0].cells[0].length).toBeLessThanOrEqual(MAX_CELL_CHARS);
    expect(out.rows[0].cells[0].endsWith("…")).toBe(true);
  });
});

describe("parseShowCardArgs: malformed input", () => {
  it("returns null for malformed JSON", () => {
    expect(parseShowCardArgs('{"card":')).toBeNull();
    expect(parseShowCardArgs("")).toBeNull();
  });

  it.each([
    ["null", "null"],
    ["a bare string", '"evidence"'],
    ["an object without card", '{"kind":"evidence"}'],
    ["card as a string", '{"card":"evidence"}'],
    ["card as null", '{"card":null}'],
  ])("returns null when the arguments are %s", (_label, input) => {
    expect(parseShowCardArgs(input)).toBeNull();
  });

  it("returns null for an unknown kind, including the retired reading list", () => {
    expect(parseShowCardArgs(raw({ kind: "table", articles: [] }))).toBeNull();
    expect(parseShowCardArgs(raw({ kind: "reading_list", articles: [{ id: pid(RAFT), why: "x" }] }))).toBeNull();
    expect(parseShowCardArgs(raw({ places: [{ target: "role-illumina", line: "x" }], articles: [] }))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// deskOf and monthYear
// ---------------------------------------------------------------------------

describe("deskOf", () => {
  it("gives the name of the article's first desk on the Writing page", () => {
    // RAFT is assigned to Training LLMs first, then RAG Applications.
    expect(deskOf(RAFT.slug)).toBe("Training LLMs");
    expect(deskOf(BOUNCER.slug)).toBe("Agent Patterns and Protocols");
  });

  it("is null for an article with no desk, or an unknown slug", () => {
    expect(deskOf("no-such-article")).toBeNull();
  });
});

describe("monthYear", () => {
  it("formats a publish date as the month and year", () => {
    expect(monthYear("2025-06-18T10:00:00.000Z")).toBe("Jun 2025");
    expect(monthYear("2026-01-01")).toBe("Jan 2026");
    expect(monthYear("2026-12-31T23:59:59Z")).toBe("Dec 2026");
  });

  it("falls back to the year when there is no valid month", () => {
    expect(monthYear("2025")).toBe("2025");
    expect(monthYear("2025-13-01")).toBe("2025");
  });
});

// ---------------------------------------------------------------------------
// buildCard: evidence
// ---------------------------------------------------------------------------

describe("buildCard: evidence places come from my data", () => {
  it("draws each place with its name from my data, the model's line, and its kind, in the order given", () => {
    const card = ok(buildCard(evidence(), "s1", { catalog: ARTICLES }));
    const places = withComponent(card.messages, "Place");

    expect(places).toHaveLength(2);
    expect(places[0]).toMatchObject({ name: "Illumina", line: "Built the RAG stack", mark: "role" });
    expect(places[1]).toMatchObject({ name: "TheMarginCall", line: "Side project on agents", mark: "project" });
    expect(withComponent(card.messages, "PlaceGrid")[0].places).toEqual(["p0", "p1"]);
  });

  it("gives a role its company's own colour, straight from my profile, and no colour to a project or a school", () => {
    const card = ok(
      buildCard(
        evidence({
          places: [
            { target: "role-mastercard", line: "Tech lead" },
            { target: "project-margin-call", line: "Side project" },
            { target: "edu-smu", line: "Studied AI" },
          ],
        }),
        "s1",
        { catalog: ARTICLES }
      )
    );
    const [mastercard, project_, school] = withComponent(card.messages, "Place");

    expect(mastercard.color).toBe(role("mastercard").brand.color);
    expect(mastercard.mark).toBe("role");
    expect(project_).not.toHaveProperty("color");
    expect(project_.mark).toBe("project");
    expect(school).not.toHaveProperty("color");
    expect(school.mark).toBe("school");
    expect(school.name).toBe("SMU");
  });

  it("names a project by its title, and a school by its short name", () => {
    const card = ok(
      buildCard(
        evidence({ places: [{ target: "project-illumina-rag", line: "x" }, { target: "edu-nus", line: "y" }] }),
        "s1",
        { catalog: ARTICLES }
      )
    );
    const names = withComponent(card.messages, "Place").map((p) => p.name);
    expect(names).toEqual([project("illumina-rag").title, "NUS"]);
  });

  it("makes each place a button that shows that target on the page", () => {
    const card = ok(buildCard(evidence(), "s1", { catalog: ARTICLES }));
    expect(showOnPageTargets(card.messages)).toEqual(["role-illumina", "project-margin-call"]);
    expect(withComponent(card.messages, "Place").every((p) => p["@catalogId"] === TITUS_CATALOG_ID)).toBe(true);
  });

  it("drops a place that is not on my site, and keeps the known ones", () => {
    const card = ok(
      buildCard(
        evidence({
          places: [
            { target: "role-nasa", line: "ghost" },
            { target: "role-illumina", line: "real" },
            { target: "project-margin-call", line: "also real" },
          ],
        }),
        "s1",
        { catalog: ARTICLES }
      )
    );
    expect(textsOf(card.messages)).not.toContain("ghost");
    expect(JSON.stringify(card.messages)).not.toContain("role-nasa");
    expect(showOnPageTargets(card.messages)).toEqual(["role-illumina", "project-margin-call"]);
  });

  it("returns an error, not a card, when every place is unknown", () => {
    const result = buildCard(evidence({ places: [{ target: "role-nasa", line: "x" }, { target: "nope", line: "y" }] }), "s1", {
      catalog: ARTICLES,
    });
    expect(result).toEqual({ ok: false, error: "none of those places is on my site" });
  });

  it("labels the places 'Where I did it' above their grid", () => {
    const card = ok(buildCard(evidence(), "s1", { catalog: ARTICLES }));
    expect(textsOf(card.messages)).toContain("Where I did it");
  });
});

describe("buildCard: evidence must span at least two parts of the site", () => {
  it("counts each place on the page PAGE_TARGETS gives it, so two on one page are refused and two on different pages are not", () => {
    const pageOf = (id: string) => PAGE_TARGETS.find((t) => t.id === id)!.path;
    for (const id of PLACE_TARGET_IDS) {
      const samePage = PLACE_TARGET_IDS.find((other) => other !== id && pageOf(other) === pageOf(id))!;
      const otherPage = PLACE_TARGET_IDS.find((other) => pageOf(other) !== pageOf(id))!;
      expect(samePage).toBeDefined();
      const one = buildCard(evidence({ places: [{ target: id, line: "a" }, { target: samePage, line: "b" }], articles: [] }), "s1", {
        catalog: ARTICLES,
      });
      expect({ id, samePage, ok: one.ok }).toEqual({ id, samePage, ok: false });
      const two = buildCard(evidence({ places: [{ target: id, line: "a" }, { target: otherPage, line: "b" }], articles: [] }), "s1", {
        catalog: ARTICLES,
      });
      expect({ id, otherPage, ok: two.ok }).toEqual({ id, otherPage, ok: true });
    }
  });

  it("refuses two places on the same page, with no source", () => {
    const result = buildCard(
      evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "role-uob", line: "b" }], articles: [] }),
      "s1",
      { catalog: ARTICLES }
    );
    expect(result).toEqual({
      ok: false,
      error: "this card is for answers that span my site: two or more of experience, projects, education and writing",
    });
  });

  it("refuses a single place, with no source, as not compound", () => {
    const result = buildCard(evidence({ places: [{ target: "role-illumina", line: "a" }], articles: [] }), "s1", { catalog: ARTICLES });
    expect(result).toEqual({ ok: false, error: "this card is for compound answers: at least 2 roles, projects or schools" });
  });

  it("accepts places on two different pages", () => {
    // role-illumina is on /experience and project-margin-call is on /projects.
    const card = ok(buildCard(evidence(), "s1", { catalog: ARTICLES }));
    expect(card.kind).toBe("evidence");
  });

  it("accepts places on two pages where one is education", () => {
    const card = ok(buildCard(evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "edu-smu", line: "b" }] }), "s1", { catalog: ARTICLES }));
    expect(card.kind).toBe("evidence");
  });

  it("refuses one place plus a numbered source: one role and one article is not compound", () => {
    const result = buildCard(evidence({ places: [{ target: "role-illumina", line: "a" }], articles: [pid(RAFT)] }), "s1", {
      catalog: ARTICLES,
      numberOf: numbered({ [RAFT.slug]: 2 }),
    });
    expect(result).toEqual({ ok: false, error: "this card is for compound answers: at least 2 roles, projects or schools" });
  });

  it("accepts two places on different pages plus a numbered source", () => {
    const card = ok(
      buildCard(
        evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "edu-smu", line: "b" }], articles: [pid(RAFT)] }),
        "s1",
        { catalog: ARTICLES, numberOf: numbered({ [RAFT.slug]: 2 }) }
      )
    );
    expect(card.sources).toEqual([2]);
  });

  it("refuses two places on the same page with no source, by the span rule (not the minimum-places rule)", () => {
    const result = buildCard(
      evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "role-uob", line: "b" }], articles: [] }),
      "s1",
      { catalog: ARTICLES }
    );
    expect(result).toEqual({
      ok: false,
      error: "this card is for answers that span my site: two or more of experience, projects, education and writing",
    });
  });

  it("refuses a card whose known places are fewer than MIN_PLACES, even if the unknown ones make up the count", () => {
    expect(MIN_PLACES).toBe(2);
    const result = buildCard(
      evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "role-nasa", line: "b" }], articles: [] }),
      "s1",
      { catalog: ARTICLES }
    );
    expect(result).toEqual({ ok: false, error: "this card is for compound answers: at least 2 roles, projects or schools" });
  });

  it("accepts two places on one page plus a numbered source", () => {
    const card = ok(
      buildCard(
        evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "role-uob", line: "b" }], articles: [pid(RAFT)] }),
        "s1",
        { catalog: ARTICLES, numberOf: numbered({ [RAFT.slug]: 2 }) }
      )
    );
    expect(card.sources).toEqual([2]);
  });

  it("refuses two places on one page when the article is not numbered in this conversation (so it never counts)", () => {
    const result = buildCard(
      evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "role-uob", line: "b" }], articles: [pid(RAFT)] }),
      "s1",
      { catalog: ARTICLES, numberOf: () => undefined }
    );
    expect(result.ok).toBe(false);
  });

  it("refuses a single place whose only other part is an article not numbered in this conversation", () => {
    const result = buildCard(evidence({ places: [{ target: "role-illumina", line: "a" }], articles: [pid(RAFT)] }), "s1", {
      catalog: ARTICLES,
      numberOf: () => undefined,
    });
    expect(result.ok).toBe(false);
  });

  it("counts the places that are on my site, not the unknown ones, toward the span", () => {
    // role-nasa is dropped, so only /experience is left: one part, no card.
    const result = buildCard(evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "role-nasa", line: "b" }], articles: [] }), "s1", {
      catalog: ARTICLES,
    });
    expect(result.ok).toBe(false);
  });
});

describe("buildCard: evidence sources come from the conversation", () => {
  const twoPlaces = { places: [{ target: "role-illumina", line: "a" }, { target: "project-margin-call", line: "b" }] };

  it("lists each cited article under its citation number, with its title and Medium link", () => {
    const card = ok(
      buildCard(evidence({ ...twoPlaces, articles: [pid(RAFT)] }), "s1", { catalog: ARTICLES, numberOf: numbered({ [RAFT.slug]: 2 }) })
    );
    const sources = withComponent(card.messages, "Source");
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({ n: 2, title: RAFT.title });
    expect(linkUrls(card.messages)).toEqual([RAFT.url]);
    expect(textsOf(card.messages)).toContain("Sources");
    expect(card.sources).toEqual([2]);
    expect(card.articles).toEqual([RAFT.slug]);
  });

  it("sorts the sources by citation number, not by the order the model gave them", () => {
    const card = ok(
      buildCard(evidence({ ...twoPlaces, articles: [pid(BOUNCER), pid(RAFT)] }), "s1", {
        catalog: ARTICLES,
        numberOf: numbered({ [RAFT.slug]: 2, [BOUNCER.slug]: 4 }),
      })
    );
    expect(withComponent(card.messages, "Source").map((s) => s.n)).toEqual([2, 4]);
    expect(card.sources).toEqual([2, 4]);
    expect(card.articles).toEqual([RAFT.slug, BOUNCER.slug]);
  });

  it("leaves out an article that has no citation number in this conversation, and draws no Sources label then", () => {
    const card = ok(buildCard(evidence({ ...twoPlaces, articles: [pid(RAFT)] }), "s1", { catalog: ARTICLES, numberOf: () => undefined }));
    expect(withComponent(card.messages, "Source")).toHaveLength(0);
    expect(textsOf(card.messages)).not.toContain("Sources");
    expect(card.sources).toEqual([]);
    expect(card.articles).toEqual([]);
  });

  it("drops an unknown article id, and keeps the known one", () => {
    const card = ok(
      buildCard(evidence({ ...twoPlaces, articles: ["nosuchid00", pid(RAFT)] }), "s1", { catalog: ARTICLES, numberOf: numbered({ [RAFT.slug]: 2 }) })
    );
    expect(card.sources).toEqual([2]);
    expect(JSON.stringify(card.messages)).not.toContain("nosuchid00");
  });

  it("finds an article by the Medium URL the model gave, as the parser reduces it", () => {
    const args = parseShowCardArgs(
      raw({ kind: "evidence", places: twoPlaces.places, articles: [RAFT.url] })
    )!;
    const card = ok(buildCard(args, "s1", { catalog: ARTICLES, numberOf: numbered({ [RAFT.slug]: 3 }) }));
    expect(card.sources).toEqual([3]);
  });

  it("opens each source from my data, and never a link the model wrote", () => {
    const card = ok(
      buildCard(evidence({ ...twoPlaces, articles: [pid(RAFT)] }), "s1", { catalog: ARTICLES, numberOf: numbered({ [RAFT.slug]: 2 }) })
    );
    const sourceActions = withComponent(card.messages, "Source").map((s) => (s.action as { functionCall: { args: { url: string } } }).functionCall.args.url);
    expect(sourceActions).toEqual([RAFT.url]);
  });

  it("gives a source whose address is not https no link, so it is left out", () => {
    const fake: Article = { ...RAFT, slug: "fake-http", url: "http://medium.com/@tituslhy/a-fake-post-abcdef123456" };
    const card = buildCard(
      evidence({ ...twoPlaces, articles: ["abcdef123456"] }),
      "s1",
      { catalog: [fake], numberOf: () => 5 }
    );
    // Two places still span the site, but the one source has no safe link: it is not listed.
    expect(ok(card).sources).toEqual([]);
  });

  it("refuses a card with sources only when its parts are one page and one source is not numbered", () => {
    const result = buildCard(evidence({ places: [{ target: "role-illumina", line: "a" }], articles: [pid(RAFT)] }), "s1", {
      catalog: ARTICLES,
      numberOf: () => undefined,
    });
    expect(result.ok).toBe(false);
  });
});

describe("buildCard: evidence summary, flair and checks", () => {
  it("states the summary with the places' names, and the source numbers when there are sources", () => {
    const card = ok(
      buildCard(
        evidence({
          places: [
            { target: "role-mastercard", line: "a" },
            { target: "role-uob", line: "b" },
          ],
          articles: [pid(BOUNCER), pid(RAFT)],
        }),
        "s1",
        { catalog: ARTICLES, numberOf: numbered({ [RAFT.slug]: 2, [BOUNCER.slug]: 4 }) }
      )
    );
    expect(card.summary).toBe("[Card shown: where I did it, “Mastercard”, “UOB”; sources [2], [4]]");
  });

  it("states the summary without a sources clause when no source is listed", () => {
    const card = ok(buildCard(evidence(), "s1", { catalog: ARTICLES }));
    expect(card.summary).toBe("[Card shown: where I did it, “Illumina”, “TheMarginCall”]");
  });

  it("is an evidence card with the plain flair, and no cited sources on a compare", () => {
    const card = ok(buildCard(evidence(), "s1", { catalog: ARTICLES }));
    expect(card.kind).toBe("evidence");
    expect(card.flair).toBe("plain");
  });

  it("opens with createSurface on the basic catalog, the plain flair, then updateComponents", () => {
    const card = ok(buildCard(evidence(), "card_9", { catalog: ARTICLES }));
    const [create, update] = card.messages as unknown as Array<{
      createSurface: { surfaceId: string; catalogId: string; metadata: { extensions: Record<string, string> } };
      updateComponents: { surfaceId: string };
    }>;
    expect(create.createSurface.surfaceId).toBe("card_9");
    expect(create.createSurface.catalogId).toBe(BASIC_CATALOG_ID);
    expect(create.createSurface.metadata.extensions.titusFlair).toBe("plain");
    expect(update.updateComponents.surfaceId).toBe("card_9");
  });

  it("passes every built evidence card through checkMessages", () => {
    const card = ok(
      buildCard(
        evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "edu-smu", line: "b" }], articles: [pid(RAFT)] }),
        "s1",
        { catalog: ARTICLES, numberOf: numbered({ [RAFT.slug]: 2 }) }
      )
    );
    expect(checkMessages(card.messages)).toBeNull();
  });

  it("never draws an article link or address that did not come from my data", () => {
    const card = ok(
      buildCard(evidence({ places: [{ target: "role-illumina", line: "a" }, { target: "edu-smu", line: "b" }], articles: [pid(RAFT)] }), "s1", {
        catalog: ARTICLES,
        numberOf: numbered({ [RAFT.slug]: 2 }),
      })
    );
    expect(linkUrls(card.messages)).toEqual([RAFT.url]);
  });
});

// ---------------------------------------------------------------------------
// buildCard: citations, bylines and desks (compare)
// ---------------------------------------------------------------------------

describe("buildCard: compare table", () => {
  it("draws the title label, the option columns, the model's cells and a My article row", () => {
    const card = ok(buildCard(compare(), "s1", { catalog: ARTICLES }));

    expect(textsOf(card.messages)).toContain("Compare · LoRA, RAFT or GRPO");
    const table = withComponent(card.messages, "Table")[0];
    expect(table.columns).toEqual(["LoRA", "RAFT", "GRPO"]);
    expect(textsOf(card.messages)).toEqual(expect.arrayContaining(["Adapters", "Docs and answers", "Rewards"]));
    const myArticle = withComponent(card.messages, "TableRow").find((r) => r.label === "My article");
    expect(myArticle).toBeDefined();
    expect(myArticle!.cells).toHaveLength(3);
    expect(card.flair).toBe("plain");
  });

  it("links each option's article to its own Medium URL, labelled by month and year", () => {
    const card = ok(buildCard(compare(), "s1", { catalog: ARTICLES }));
    expect(linkUrls(card.messages)).toEqual(expect.arrayContaining([RAFT.url, GRPO.url]));
    expect(textsOf(card.messages)).toContain(`${monthYear(RAFT.publishedAt)}`);
    // LoRA has no article: a dash, not a link.
    expect(textsOf(card.messages)).toContain("—");
  });

  it("adds the citation number to an option's article link when it has one", () => {
    const card = ok(buildCard(compare(), "s1", { catalog: ARTICLES, numberOf: (slug) => (slug === RAFT.slug ? 5 : undefined) }));
    expect(textsOf(card.messages)).toContain(`${monthYear(RAFT.publishedAt)} [5]`);
  });

  it("drops an unknown article id from its option's link, and keeps the card and the cells", () => {
    const card = ok(
      buildCard(
        compare({
          options: [
            { name: "LoRA", article: "nosuchid00" },
            { name: "RAFT", article: pid(RAFT) },
          ],
          rows: [{ label: "Trains on", cells: ["Adapters", "Docs"] }],
        }),
        "s1",
        { catalog: ARTICLES }
      )
    );
    expect(textsOf(card.messages)).toContain("Adapters");
    expect(textsOf(card.messages)).toContain("—");
    expect(linkUrls(card.messages)).toEqual([RAFT.url]);
    expect(card.articles).toEqual([RAFT.slug]);
    expect(JSON.stringify(card.messages)).not.toContain("nosuchid00");
  });

  it("drops the My article row entirely when no option has a known article", () => {
    const card = ok(
      buildCard(
        compare({
          options: [
            { name: "A", article: null },
            { name: "B", article: "nosuchid00" },
          ],
          rows: [{ label: "L", cells: ["x", "y"] }],
        }),
        "s1",
        { catalog: ARTICLES }
      )
    );
    expect(withComponent(card.messages, "TableRow").map((r) => r.label)).toEqual(["L"]);
    expect(linkUrls(card.messages)).toEqual([]);
    expect(card.articles).toEqual([]);
  });

  it("gives the card its shared desk when every linked article is on one desk", () => {
    // Both the multi-agent piece and the bouncer piece are on Agent Patterns and Protocols.
    const card = ok(
      buildCard(
        compare({
          options: [
            { name: "Supervisor", article: pid(MULTI_AGENT) },
            { name: "Router", article: pid(BOUNCER) },
          ],
          rows: [{ label: "Good for", cells: ["Big teams", "Messy inputs"] }],
        }),
        "s1",
        { catalog: ARTICLES }
      )
    );
    expect(withComponent(card.messages, "Label").map((l) => l.text)).toContain("Agent Patterns and Protocols");
    expect(checkMessages(card.messages)).toBeNull();
  });

  it("leaves the desk off when the linked articles span more than one desk", () => {
    // RAFT is on Training LLMs and the bouncer on Agent Patterns and Protocols: two desks, so no desk label.
    const mixed = ok(
      buildCard(
        compare({
          options: [
            { name: "RAFT", article: pid(RAFT) },
            { name: "Bouncer", article: pid(BOUNCER) },
          ],
          rows: [{ label: "L", cells: ["a", "b"] }],
        }),
        "s1",
        { catalog: ARTICLES }
      )
    );
    expect(withComponent(mixed.messages, "Label").map((l) => l.text)).toEqual(["Compare · LoRA, RAFT or GRPO"]);
  });

  it("gives the desk when the one linked article's desk is shared by a single option", () => {
    const card = ok(
      buildCard(
        compare({
          options: [
            { name: "A", article: null },
            { name: "RAFT", article: pid(RAFT) },
          ],
          rows: [{ label: "L", cells: ["x", "y"] }],
        }),
        "s1",
        { catalog: ARTICLES }
      )
    );
    expect(withComponent(card.messages, "Label").map((l) => l.text)).toContain("Training LLMs");
  });

  it("uses the summary line with the option names and the rows", () => {
    const card = ok(buildCard(compare(), "s1", { catalog: ARTICLES }));
    expect(card.summary).toBe(`[Card shown: compare table of “LoRA”, “RAFT”, “GRPO” on “Trains on”]`);
  });

  it("has no sources, since a compare table lists none", () => {
    const card = ok(buildCard(compare(), "s1", { catalog: ARTICLES, numberOf: () => 1 }));
    expect(card.kind).toBe("compare");
    expect(card.sources).toEqual([]);
    expect(withComponent(card.messages, "Source")).toHaveLength(0);
  });

  it("passes every built compare card through checkMessages", () => {
    const card = ok(buildCard(compare(), "s1", { catalog: ARTICLES }));
    expect(checkMessages(card.messages)).toBeNull();
  });

  it("keeps the model's cells verbatim, with no link or article text added to them", () => {
    const card = ok(buildCard(compare(), "s1", { catalog: ARTICLES }));
    const cellTexts = textsOf(card.messages).filter((t) => ["Adapters", "Docs and answers", "Rewards"].includes(t));
    expect(cellTexts).toEqual(["Adapters", "Docs and answers", "Rewards"]);
  });

  it("fails checkMessages for a tampered copy of a built card, so buildCard would never send an unknown component", () => {
    const card = ok(buildCard(compare(), "s1", { catalog: ARTICLES }));
    const tampered = JSON.parse(JSON.stringify(card.messages)) as AgentToRendererMessage[];
    componentsOf(tampered)[0].component = "Video";
    expect(checkMessages(tampered)).toMatch(/unknown component Video/);
  });
});

// ---------------------------------------------------------------------------
// buildCard with a small fake catalog: edge cases the real corpus doesn't have
// ---------------------------------------------------------------------------

const fakeArticle = (overrides: Partial<Article> = {}): Article => ({
  slug: "fake-post",
  title: "A fake post",
  url: "https://medium.com/@tituslhy/a-fake-post-abcdef123456",
  publishedAt: "2025-02-03T10:00:00.000Z",
  summary: "s",
  keywords: [],
  outline: [],
  intro: "",
  body: "",
  words: 100,
  ...overrides,
});

describe("buildCard with a fake catalog", () => {
  it("finds an article by the Medium post id at the end of its url", () => {
    const fake = fakeArticle();
    const card = ok(
      buildCard(evidence({ articles: ["abcdef123456"] }), "s1", { catalog: [fake], numberOf: () => 1 })
    );
    expect(card.articles).toEqual(["fake-post"]);
  });

  it("keeps the first article when two share a post id", () => {
    const first = fakeArticle({ slug: "first", title: "First" });
    const second = fakeArticle({ slug: "second", title: "Second" });
    const card = ok(buildCard(evidence({ articles: ["abcdef123456"] }), "s1", { catalog: [first, second], numberOf: () => 1 }));
    expect(card.articles).toEqual(["first"]);
    expect(withComponent(card.messages, "Source").map((c) => c.title)).toEqual(["First"]);
  });

  it("drops an article whose url is not https (no link can be drawn for it)", () => {
    const fake = fakeArticle({ url: "http://medium.com/@tituslhy/a-fake-post-abcdef123456" });
    const card = ok(buildCard(evidence({ articles: ["abcdef123456"] }), "s1", { catalog: [fake], numberOf: () => 1 }));
    expect(card.sources).toEqual([]);
  });

  it("draws a compare link for an article whose month is unknown, falling back to the year", () => {
    const fake = fakeArticle({ publishedAt: "2024" });
    const card = ok(
      buildCard(
        compare({
          options: [
            { name: "A", article: "abcdef123456" },
            { name: "B", article: null },
          ],
          rows: [{ label: "L", cells: ["x", "y"] }],
        }),
        "s1",
        { catalog: [fake] }
      )
    );
    expect(textsOf(card.messages)).toContain("2024");
  });
});

// ---------------------------------------------------------------------------
// checkMessages
// ---------------------------------------------------------------------------

const surfaceMessages = (catalogId: string, components: Record<string, unknown>[]): AgentToRendererMessage[] =>
  [
    { version: "1.0", createSurface: { surfaceId: "s", catalogId, metadata: {} } },
    { version: "1.0", updateComponents: { surfaceId: "s", components } },
  ] as unknown as AgentToRendererMessage[];

describe("checkMessages", () => {
  it("accepts a valid card built by buildCard", () => {
    const card = ok(buildCard(compare(), "s1", { catalog: ARTICLES }));
    expect(checkMessages(card.messages)).toBeNull();
  });

  it("accepts a small valid surface on the basic catalog", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [
      { id: "t", component: "Text", text: "hello" },
      { id: "root", component: "Card", child: "t" },
    ]);
    expect(checkMessages(messages)).toBeNull();
  });

  it("rejects a component that is in neither catalog", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "v", component: "Video", url: "https://x.y/a.mp4" }]);
    expect(checkMessages(messages)).toMatch(/unknown component Video \(v\)/);
  });

  it("rejects a component name from my catalog used on the basic catalog's surface", () => {
    // Titus components are only known under the Titus catalog id.
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "l", component: "Label", text: "x" }]);
    expect(checkMessages(messages)).toMatch(/unknown component Label/);
  });

  it("accepts my components when they are marked with the Titus catalog id", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "l", component: "Label", text: "x", "@catalogId": TITUS_CATALOG_ID }]);
    expect(checkMessages(messages)).toBeNull();
  });

  it("accepts the Place, PlaceGrid and Source components of an evidence card", () => {
    const card = ok(buildCard(evidence({ articles: [pid(RAFT)] }), "s1", { catalog: ARTICLES, numberOf: numbered({ [RAFT.slug]: 2 }) }));
    expect(checkMessages(card.messages)).toBeNull();
    expect(withComponent(card.messages, "Source")).toHaveLength(1);
  });

  it("rejects an unknown Titus component even when marked with the Titus id", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "x", component: "Carousel", "@catalogId": TITUS_CATALOG_ID }]);
    expect(checkMessages(messages)).toMatch(/unknown component Carousel \(x\)/);
  });

  it("rejects a Place whose colour is not an oklch colour", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [
      { id: "p", component: "Place", name: "X", line: "y", mark: "role", color: "red", action: { functionCall: { "@call": "showOnPage", args: { target: "role-uob" } } }, "@catalogId": TITUS_CATALOG_ID },
    ]);
    expect(checkMessages(messages)).not.toBeNull();
  });

  it("rejects an Image whose address is http, and names the image", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "img", component: "Image", url: "http://cdn.example.com/a.png" }]);
    expect(checkMessages(messages)).toMatch(/image img is not https/);
  });

  it("rejects an Image whose address is javascript:", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "img", component: "Image", url: "javascript:alert(1)" }]);
    expect(checkMessages(messages)).toMatch(/image img is not https/);
  });

  it("rejects an Image whose address is not a URL at all", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "img", component: "Image", url: "not a url" }]);
    expect(checkMessages(messages)).toMatch(/image img is not https/);
  });

  it("accepts an https Image", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "img", component: "Image", url: "https://cdn.example.com/a.png" }]);
    expect(checkMessages(messages)).toBeNull();
  });

  it("rejects an openUrl button whose link is http", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [
      { id: "b", component: "Button", child: "t", action: { functionCall: { "@call": "openUrl", args: { url: "http://x.example.com" } } } },
    ]);
    expect(checkMessages(messages)).toMatch(/link b is not https/);
  });

  it("rejects a Source whose openUrl link is http, and names the link", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [
      { id: "s0", component: "Source", n: 1, title: "x", action: { functionCall: { "@call": "openUrl", args: { url: "http://x.example.com" } } }, "@catalogId": TITUS_CATALOG_ID },
    ]);
    expect(checkMessages(messages)).toMatch(/link s0 is not https/);
  });

  it("rejects an openUrl button whose link is javascript:", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [
      { id: "b", component: "Button", child: "t", action: { functionCall: { "@call": "openUrl", args: { url: "javascript:alert(1)" } } } },
    ]);
    expect(checkMessages(messages)).toMatch(/link b is not https/);
  });

  it("rejects an openUrl button with no url at all", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [
      { id: "b", component: "Button", child: "t", action: { functionCall: { "@call": "openUrl", args: {} } } },
    ]);
    expect(checkMessages(messages)).toMatch(/link b is not https/);
  });

  it("does not apply the https check to a showOnPage button, which carries a target not a link", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [
      { id: "b", component: "Button", child: "t", action: { functionCall: { "@call": "showOnPage", catalogId: TITUS_CATALOG_ID, args: { target: "role-uob" } } } },
    ]);
    expect(checkMessages(messages)).toBeNull();
  });

  it("does not apply the https check to an ask button, which carries a question not a link", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [
      { id: "b", component: "Button", child: "t", action: { functionCall: { "@call": "ask", catalogId: TITUS_CATALOG_ID, args: { question: "Hi?" } } } },
    ]);
    expect(checkMessages(messages)).toBeNull();
  });

  it("rejects a component with an extra prop my catalog's strict schema does not allow", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [
      { id: "l", component: "Label", text: "x", tone: "ink", style: "neon", "@catalogId": TITUS_CATALOG_ID },
    ]);
    expect(checkMessages(messages)).not.toBeNull();
  });

  it("rejects a Label with a tone outside its enum", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "l", component: "Label", text: "x", tone: "red", "@catalogId": TITUS_CATALOG_ID }]);
    expect(checkMessages(messages)).not.toBeNull();
  });

  it("rejects a Title whose level is not lead or item", () => {
    const messages = surfaceMessages(BASIC_CATALOG_ID, [{ id: "t", component: "Title", text: "x", level: "huge", "@catalogId": TITUS_CATALOG_ID }]);
    expect(checkMessages(messages)).not.toBeNull();
  });

  it("returns null for messages with no component update at all", () => {
    expect(checkMessages([{ version: "1.0", createSurface: { surfaceId: "s", catalogId: BASIC_CATALOG_ID, metadata: {} } }] as unknown as AgentToRendererMessage[])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The show_card tool's schema is strict and agrees with the parser's caps.
// ---------------------------------------------------------------------------

describe("SHOW_CARD_PARAMETERS", () => {
  it("is a strict object with one required card that is one of the two kinds, evidence then compare", () => {
    expect(SHOW_CARD_PARAMETERS.required).toEqual(["card"]);
    expect(SHOW_CARD_PARAMETERS.additionalProperties).toBe(false);
    const kinds = SHOW_CARD_PARAMETERS.properties.card.anyOf.map((s) => s.properties.kind.enum[0]);
    expect(kinds).toEqual(["evidence", "compare"]);
  });

  it("limits an evidence card's places to the place targets, and its articles to the source cap", () => {
    const [evidenceKind] = SHOW_CARD_PARAMETERS.properties.card.anyOf;
    expect(evidenceKind.properties.places.maxItems).toBe(MAX_PLACES);
    expect(evidenceKind.properties.places.minItems).toBe(MIN_PLACES);
    expect(evidenceKind.properties.places.items.properties.target.enum).toEqual(PLACE_TARGET_IDS);
    expect(evidenceKind.properties.articles.maxItems).toBe(MAX_SOURCES);
    expect(evidenceKind.required).toEqual(["kind", "places", "articles"]);
  });

  it("states the caps in the descriptions the model reads", () => {
    const [evidenceKind, compareKind] = SHOW_CARD_PARAMETERS.properties.card.anyOf;
    expect(JSON.stringify(evidenceKind)).toContain(`${MAX_LINE_CHARS} characters`);
    expect(compareKind.properties.options.maxItems).toBe(MAX_OPTIONS);
    expect(compareKind.properties.rows.maxItems).toBe(MAX_ROWS);
  });
});
