/**
 * @jest-environment node
 */

import { readFileSync } from "fs";
import { join } from "path";
import { buildSystemPrompt } from "../lib/copilot-prompt";
import {
  GOLDEN,
  countsForRetrieval,
  expectedCard,
  expectedPick,
  missingRecord,
  retrievalQueries,
  spokenStyleProblems,
  usedRecord,
  type GoldenRow,
} from "./eval-golden";

const TEMPLATE_PATH = join(__dirname, "..", "copilot-system-prompt.md");
const RENDERED = buildSystemPrompt(readFileSync(TEMPLATE_PATH, "utf-8"));
const row = (overrides: Partial<GoldenRow>): GoldenRow => ({ question: "q", expect: { kind: "none" }, ...overrides });

const ABSTRACT = /production[- ]ready agents/i;

describe("GOLDEN retrieval rows", () => {
  it("the multi-part row searches each part as its own topic", () => {
    const row = GOLDEN.find((r) => /LiteLLM/i.test(r.question) && /Helm/i.test(r.question) && /Nginx/i.test(r.question));

    expect(row).toBeDefined();
    expect(row!.topics).toHaveLength(3);
    expect(row!.topics!.some((t) => /litellm/i.test(t))).toBe(true);
    expect(row!.topics!.some((t) => /helm/i.test(t))).toBe(true);
    expect(row!.topics!.some((t) => /nginx/i.test(t))).toBe(true);
    expect(retrievalQueries(row!)).toEqual(row!.topics);
  });

  it("abstract rows are scored end to end only", () => {
    const rows = GOLDEN.filter((r) => ABSTRACT.test(r.question));

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(countsForRetrieval(row)).toBe(false);
    }
  });

  it("every other row is retrieval-scored with its question as the one query", () => {
    const rows = GOLDEN.filter((r) => !ABSTRACT.test(r.question) && !r.topics && r.retrieval !== false);

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(countsForRetrieval(row)).toBe(true);
      expect(retrievalQueries(row)).toEqual([row.question]);
    }
  });

  it("every expected title is unique per row and non-empty", () => {
    for (const row of GOLDEN) {
      // The expected articles of a row: `expect.titles` for article rows, none for a no-search row.
      const titles: string[] = ("titles" in row.expect && row.expect.titles) || [];

      expect(titles.every((t) => t.trim().length > 0)).toBe(true);
      expect(new Set(titles).size).toBe(titles.length);
    }
  });
});

describe("usedRecord", () => {
  const withRecord = row({ record: ["Illumina", "TigerGraph", "Neo4j"] });

  it("is null for a row with no record", () => {
    expect(usedRecord(row({}), "anything at all")).toBeNull();
  });

  it("is true when the reply names every record word", () => {
    expect(usedRecord(withRecord, "I used TigerGraph and Neo4j at Illumina from 2023.")).toBe(true);
  });

  it("is false when the reply misses any one record word", () => {
    expect(usedRecord(withRecord, "I used TigerGraph and Neo4j.")).toBe(false);
    expect(usedRecord(withRecord, "At Illumina I used TigerGraph.")).toBe(false);
  });

  it("is false for a reply that names none of the words", () => {
    expect(usedRecord(withRecord, "I haven't written about that.")).toBe(false);
  });

  it("matches case-insensitively, in both directions", () => {
    expect(usedRecord(withRecord, "illumina, tigergraph and NEO4J")).toBe(true);
    expect(usedRecord(row({ record: ["uob"] }), "At UOB I shipped it.")).toBe(true);
  });

  it("is true for a row whose record is empty (nothing to miss)", () => {
    expect(usedRecord(row({ record: [] }), "")).toBe(true);
  });
});

describe("missingRecord and usedRecord with alternatives", () => {
  // "SMU|MITB|Singapore Management University" is one record word: any one of its names counts.
  const withAlternative = row({ record: ["Illumina", "SMU|MITB|Singapore Management University"] });

  it("is null for a row with no record", () => {
    expect(missingRecord(row({}), "anything at all")).toBeNull();
  });

  it("is an empty list when every entry is named, using any one name of an alternative", () => {
    expect(missingRecord(withAlternative, "At Illumina I studied at SMU.")).toEqual([]);
    expect(missingRecord(withAlternative, "At Illumina I studied at MITB.")).toEqual([]);
    expect(missingRecord(withAlternative, "At Illumina, at Singapore Management University.")).toEqual([]);
  });

  it("lists the one entry none of whose names appear", () => {
    expect(missingRecord(withAlternative, "At Illumina I shipped it.")).toEqual(["SMU|MITB|Singapore Management University"]);
  });

  it("lists a plain entry that is missing, alongside an alternative that is named", () => {
    expect(missingRecord(withAlternative, "I studied at SMU.")).toEqual(["Illumina"]);
  });

  it("lists every entry when none of the names appear", () => {
    expect(missingRecord(withAlternative, "I haven't written about that.")).toEqual([
      "Illumina",
      "SMU|MITB|Singapore Management University",
    ]);
  });

  it("matches the alternatives case-insensitively", () => {
    expect(missingRecord(withAlternative, "ILLUMINA, singapore management university")).toEqual([]);
    expect(missingRecord(row({ record: ["mitb|smu"] }), "I did it at Smu.")).toEqual([]);
  });

  it("usedRecord is true only when no entry is missing", () => {
    expect(usedRecord(withAlternative, "At Illumina I studied at MITB.")).toBe(true);
    expect(usedRecord(withAlternative, "At Illumina I shipped it.")).toBe(false);
    expect(usedRecord(withAlternative, "I studied at SMU.")).toBe(false);
  });

  it("usedRecord is null for a row with no record, and true for an empty one", () => {
    expect(usedRecord(row({}), "x")).toBeNull();
    expect(usedRecord(row({ record: [] }), "")).toBe(true);
  });
});

describe("GOLDEN experience-with rows", () => {
  const withRecord = GOLDEN.filter((r) => r.record);

  it("has the four experience-with rows (knowledge graphs, Java, computer vision, Helm)", () => {
    expect(withRecord.map((r) => r.question)).toEqual([
      "Tell me about your experience with knowledge graphs.",
      "What's your experience with Java?",
      "Have you worked on computer vision use cases?",
      "Have you used Helm?",
    ]);
  });

  it("gives the computer-vision row its Illumina and SMU record, found in the rendered prompt", () => {
    const cv = GOLDEN.find((r) => r.question === "Have you worked on computer vision use cases?");
    expect(cv).toBeDefined();
    expect(cv!.expect).toEqual({ kind: "articles", titles: ["Multimodal RAG"] });
    expect(cv!.topics).toEqual(["computer vision"]);
    expect(cv!.record).toEqual(["Illumina", "SMU|MITB|Singapore Management University"]);
    expect(RENDERED).toContain("Illumina");
    expect(cv!.record!.some((w) => /(^|\|)SMU($|\|)/.test(w))).toBe(true);
    expect(RENDERED).toContain("SMU");
  });

  it("gives every row with a record the articles kind and topics", () => {
    for (const r of withRecord) {
      expect(r.expect.kind).toBe("articles");
      expect(r.topics?.length).toBeGreaterThan(0);
    }
  });

  it("names only record words that the rendered copilot prompt contains", () => {
    // Drift guard: a record word must be something the copilot is told about, or it can't be expected in a reply.
    for (const r of withRecord) {
      for (const word of r.record!) {
        // "a|b" is one word: it is in the prompt when any one of its names is.
        expect(word.split("|").some((name) => RENDERED.includes(name))).toBe(true);
      }
    }
  });

  it("keeps the pre-existing no-search rows as no-search", () => {
    const NO_SEARCH_QUESTIONS = [
      "What did you build at Illumina?",
      "Where did you study?",
      "What do you do at Mastercard?",
      "How do you stand out against other candidates?",
    ];
    for (const question of NO_SEARCH_QUESTIONS) {
      const found = GOLDEN.find((r) => r.question === question);
      expect(found).toBeDefined();
      expect(found!.expect).toEqual({ kind: "no-search" });
    }
  });

  it("never gives a no-search row a record", () => {
    for (const r of GOLDEN.filter((g) => g.expect.kind === "no-search")) {
      expect(r.record).toBeUndefined();
    }
  });
});

describe("expectedCard", () => {
  it("is none for a no-search row, which must not carry a card", () => {
    expect(expectedCard(row({ expect: { kind: "no-search" } }))).toBe("none");
  });

  it("is none for a none row, which searches and finds nothing to card", () => {
    expect(expectedCard(row({ expect: { kind: "none" } }))).toBe("none");
  });

  it("is null for an article row with no card set: not scored", () => {
    expect(expectedCard(row({ expect: { kind: "articles", titles: ["Agent Memory"] } }))).toBeNull();
  });

  it("returns the row's own card for an article row", () => {
    expect(expectedCard(row({ expect: { kind: "articles", titles: ["x"] }, card: "evidence" }))).toBe("evidence");
    expect(expectedCard(row({ expect: { kind: "articles", titles: ["x"] }, card: "compare" }))).toBe("compare");
  });

  it("uses only the current card kinds in the golden set", () => {
    for (const r of GOLDEN) expect(["evidence", "compare", "none", undefined]).toContain(r.card);
  });

  it("lets an explicit card win over the default for a no-search row", () => {
    expect(expectedCard(row({ expect: { kind: "no-search" }, card: "compare" }))).toBe("compare");
  });

  it("lets an explicit none stand on an article row", () => {
    expect(expectedCard(row({ expect: { kind: "articles", titles: ["x"] }, card: "none" }))).toBe("none");
  });

  it("is never null for a no-search or none row in the real golden set", () => {
    for (const r of GOLDEN.filter((g) => g.expect.kind === "no-search" || g.expect.kind === "none")) {
      expect(expectedCard(r)).toBe("none");
    }
  });

  it("marks the LoRA-RAFT-GRPO compare row in the golden set", () => {
    const compareRow = GOLDEN.find((r) => /LoRA, RAFT or GRPO/.test(r.question));
    expect(expectedCard(compareRow!)).toBe("compare");
  });

  it("expects no card for the 'which of your articles' row, which only filters the Writing page", () => {
    const listRow = GOLDEN.find((r) => /Which of your articles should I read to build production-ready agents/.test(r.question));
    expect(listRow).toBeDefined();
    expect(expectedCard(listRow!)).toBe("none");
  });

  it("expects no card for the blockchain row, which is about my articles only", () => {
    const blockchain = GOLDEN.find((r) => /blockchain/i.test(r.question));
    expect(blockchain).toBeDefined();
    expect(expectedCard(blockchain!)).toBe("none");
  });

  it("expects an evidence card for the 'how would you design' row, which spans the site", () => {
    const design = GOLDEN.find((r) => /How would you design production-ready agents/.test(r.question));
    expect(expectedCard(design!)).toBe("evidence");
  });
});

describe("expectedPick", () => {
  it("is the row's own pick flag when it sets one", () => {
    expect(expectedPick(row({ pick: true }))).toBe(true);
    expect(expectedPick(row({ pick: false }))).toBe(false);
  });

  it("is null for a row with no pick flag: not scored", () => {
    expect(expectedPick(row({ expect: { kind: "articles", titles: ["x"] } }))).toBeNull();
    expect(expectedPick(row({ pick: undefined }))).toBeNull();
  });

  it("marks the articles-only rows as a pick, and the rows that span the site as not", () => {
    const blockchain = GOLDEN.find((r) => /blockchain/i.test(r.question));
    const onlyArticles = GOLDEN.find((r) => /Which of your articles should I read to build production-ready agents/.test(r.question));
    const design = GOLDEN.find((r) => /How would you design production-ready agents/.test(r.question));
    expect(expectedPick(blockchain!)).toBe(true);
    expect(expectedPick(onlyArticles!)).toBe(true);
    expect(expectedPick(design!)).toBe(false);
  });

  it("leaves a plain retrieval row unscored", () => {
    const litellm = GOLDEN.find((r) => /What do you think about LiteLLM/.test(r.question));
    expect(expectedPick(litellm!)).toBeNull();
  });
});

describe("spokenStyleProblems", () => {
  it("finds nothing wrong with two plain paragraphs and [n] citations", () => {
    const reply = "I wrote about RAFT in a piece on fine-tuning [1].\n\nIt trains on documents plus distractors, which is the part I liked [2].";

    expect(spokenStyleProblems(reply)).toEqual([]);
  });

  it.each([
    ["a dash list", "- one\n- two", "list"],
    ["a star list", "* one\n* two", "list"],
    ["a numbered list", "1. one\n2. two", "list"],
    ["a heading", "## My roles\nI built things.", "heading"],
    ["bold text", "I used **LangGraph** a lot.", "bold"],
    ["a URL", "It is at https://medium.com/@tituslhy today.", "url"],
  ])("names %s", (_label, reply, problem) => {
    expect(spokenStyleProblems(reply)).toEqual([problem]);
  });

  it("flags three paragraphs, and counts a blank run as one break", () => {
    expect(spokenStyleProblems("One.\n\nTwo.\n\nThree.")).toEqual(["more than two paragraphs"]);
    expect(spokenStyleProblems("One.\n\n\n\nTwo.")).toEqual([]);
  });

  describe("when a card was shown", () => {
    it("is clean when the reply says it put something on screen", () => {
      expect(spokenStyleProblems("I've put the timeline on screen.\n\nIt starts at Illumina.", true)).toEqual([]);
      expect(spokenStyleProblems("I've put it on the screen.", true)).toEqual([]);
    });

    it("names a reply that never says so", () => {
      expect(spokenStyleProblems("It starts at Illumina.", true)).toEqual(["card not mentioned"]);
    });

    it("is not checked when no card was shown", () => {
      expect(spokenStyleProblems("It starts at Illumina.")).toEqual([]);
      expect(spokenStyleProblems("It starts at Illumina.", false)).toEqual([]);
    });
  });

  describe("the word budget", () => {
    const words = (n: number) => Array.from({ length: n }, () => "word").join(" ");

    it("accepts 120 words and flags 121", () => {
      expect(spokenStyleProblems(`${words(119)}.`)).toEqual([]);
      expect(spokenStyleProblems(`${words(120)}.`)).toEqual([]);
      expect(spokenStyleProblems(`${words(121)}.`)).toEqual(["over 120 words"]);
    });

    it("does not count [n] citation markers", () => {
      expect(spokenStyleProblems(`${words(118)} [1] [1][1][1] [3][4] [1][1][1][1][1].`)).toEqual([]);
    });

    it("comes after the other problems", () => {
      expect(spokenStyleProblems(`- ${words(125)}`)).toEqual(["list", "over 120 words"]);
    });
  });

  it("lists every problem a reply has", () => {
    expect(spokenStyleProblems("# Title\n- **a**\nhttps://x.com")).toEqual(["list", "heading", "bold", "url"]);
  });
});

describe("the spoken golden rows", () => {
  const spoken = GOLDEN.filter((r) => r.spoken);

  it("are three, each with its own question", () => {
    expect(spoken).toHaveLength(3);
    expect(new Set(spoken.map((r) => r.question)).size).toBe(3);
  });

  it("include one that expects the evidence card", () => {
    expect(spoken.some((r) => r.card === "evidence")).toBe(true);
  });

  it("include one that cites an article", () => {
    expect(spoken.some((r) => r.expect.kind === "articles")).toBe(true);
  });
});
