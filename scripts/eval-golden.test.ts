/**
 * @jest-environment node
 */

import { GOLDEN, countsForRetrieval, retrievalQueries } from "./eval-golden";

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
