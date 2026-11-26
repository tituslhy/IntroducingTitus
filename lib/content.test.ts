import articlesMeta from "@/content/articles-meta.json";
import { ARTICLE_COUNT_NUMBER, ARTICLE_COUNT_WORD, CAREER_START, YEARS_EXPERIENCE, YEARS_EXPERIENCE_NUMBER, numberToWords, yearsSince } from "./content";

describe("numberToWords", () => {
  it.each([
    [0, "zero"],
    [7, "seven"],
    [13, "thirteen"],
    [19, "nineteen"],
    [20, "twenty"],
    [21, "twenty one"],
    [65, "sixty five"],
    [90, "ninety"],
    [100, "one hundred"],
    [105, "one hundred and five"],
    [110, "one hundred and ten"],
    [119, "one hundred and nineteen"],
    [200, "two hundred"],
    [999, "nine hundred and ninety nine"],
  ])("formats %i as %j", (n, words) => {
    expect(numberToWords(n)).toBe(words);
  });

  it("never hyphenates compound numbers, to match the page copy", () => {
    for (let n = 0; n <= 999; n++) {
      expect(numberToWords(n)).not.toContain("-");
    }
  });

  it.each([
    ["a negative number", -1],
    ["a number above 999", 1000],
    ["a fraction", 1.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("throws RangeError for %s", (_label, n) => {
    expect(() => numberToWords(n)).toThrow(RangeError);
  });
});

describe("article count constants", () => {
  it("takes the canonical count from content/articles-meta.json", () => {
    expect(ARTICLE_COUNT_NUMBER).toBe(articlesMeta.count);
  });

  it("derives the word form from the numeric count", () => {
    expect(ARTICLE_COUNT_WORD).toBe(numberToWords(articlesMeta.count));
  });
});

describe("years of experience", () => {
  it("counts from the career start, as of today", () => {
    expect(CAREER_START).toEqual({ year: 2018, month: 4 });
    expect(YEARS_EXPERIENCE_NUMBER).toBe(yearsSince(CAREER_START));
  });

  it("spells the number out for the front page", () => {
    expect(numberToWords(YEARS_EXPERIENCE_NUMBER)).toMatch(/^[a-z ]+$/);
  });

  it("derives the 'N+ years' label from the numeric value", () => {
    expect(YEARS_EXPERIENCE).toBe(`${YEARS_EXPERIENCE_NUMBER}+ years`);
  });
});

describe("yearsSince", () => {
  const START = { year: 2018, month: 4 };
  const at = (iso: string) => new Date(iso);

  it("counts whole years up to the start month of the year it reaches", () => {
    expect(yearsSince(START, at("2026-11-26T04:00:00Z"))).toBe(8);
  });

  it("is one less in the months before the start month of that year", () => {
    expect(yearsSince(START, at("2026-03-15T04:00:00Z"))).toBe(7);
    expect(yearsSince(START, at("2027-03-31T04:00:00Z"))).toBe(8);
  });

  it("gives 0 in the start month of the start year, and 0 for a start on the first of the month", () => {
    expect(yearsSince(START, at("2018-04-01T04:00:00Z"))).toBe(0);
    expect(yearsSince({ year: 2020, month: 1 }, at("2020-01-01T00:00:00Z"))).toBe(0);
  });

  it("adds the year on the 1st of the start month, in Singapore time: 15:59Z on 31 March is still 31 March there", () => {
    expect(yearsSince(START, at("2027-03-31T15:59:00Z"))).toBe(8);
  });

  it("is already 1 April in Singapore at 16:30Z on 31 March, so it is 9", () => {
    expect(yearsSince(START, at("2027-03-31T16:30:00Z"))).toBe(9);
  });

  it("uses Singapore's calendar, not UTC's: 23:30Z on 31 March is already 1 April there", () => {
    expect(yearsSince(START, at("2027-03-31T23:30:00Z"))).toBe(9);
  });

  it("is 9 from the first moment of 1 April in Singapore (00:00 UTC+8 is 16:00Z on 31 March)", () => {
    expect(yearsSince(START, at("2027-03-31T16:00:00Z"))).toBe(9);
    expect(yearsSince(START, at("2027-03-31T15:59:59.999Z"))).toBe(8);
  });

  it("uses the current date when no date is given", () => {
    expect(yearsSince(START)).toBe(yearsSince(START, new Date()));
  });
});
