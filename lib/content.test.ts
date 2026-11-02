import articlesMeta from "@/content/articles-meta.json";
import { ARTICLE_COUNT_NUMBER, ARTICLE_COUNT_WORD, numberToWords } from "./content";

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
