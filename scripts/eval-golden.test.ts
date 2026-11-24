/**
 * @jest-environment node
 */

import { readFileSync } from "fs";
import { join } from "path";
import { buildSystemPrompt } from "../lib/copilot-prompt";
import { GOLDEN, countsForRetrieval, retrievalQueries, usedRecord, type GoldenRow } from "./eval-golden";

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
    const rows = GOLDEN.filter((r) => !ABSTRACT.test(r.question) && !r.topics);

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
    expect(cv!.record).toEqual(["Illumina", "SMU"]);
    expect(RENDERED).toContain("SMU");
    expect(RENDERED).toContain("Illumina");
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
        expect(RENDERED).toContain(word);
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
