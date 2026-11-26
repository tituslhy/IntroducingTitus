import { cardLabel, historyContent, toCard, type CardData } from "./card-event";

const messages = [
  { version: "1.0", createSurface: { surfaceId: "card_1", catalogId: "x", metadata: {} } },
  { version: "1.0", updateComponents: { surfaceId: "card_1", components: [] } },
];

const valid = {
  id: "card_1",
  kind: "evidence",
  summary: "[Card shown: where I did it, “Illumina”; sources [2]]",
  flair: "plain",
  messages,
  sources: [2],
};

const card = (overrides: Partial<CardData> = {}): CardData => ({
  id: "card_1",
  kind: "evidence",
  summary: "[Card shown: where I did it, “Illumina”; sources [2]]",
  flair: "plain",
  messages: messages as CardData["messages"],
  sources: [2],
  ...overrides,
});

describe("toCard", () => {
  it("returns the card as given when every field is valid", () => {
    expect(toCard(valid)).toEqual({ ...valid, messages });
  });

  it("accepts the compare kind too", () => {
    expect(toCard({ ...valid, kind: "compare", summary: "[Card shown: compare table of “A”, “B” on “x”]", sources: [] })?.kind).toBe("compare");
  });

  it.each([
    ["a missing id", { id: undefined }],
    ["an empty id", { id: "" }],
    ["a numeric id", { id: 1 }],
    ["a missing summary", { summary: undefined }],
    ["an empty summary", { summary: "" }],
    ["a flair that is not known", { flair: "clipping" }],
    ["a flair that is not known at all", { flair: "neon" }],
    ["a missing flair", { flair: undefined }],
    ["a non-string flair", { flair: 2 }],
    ["a kind that is not known", { kind: "table" }],
    ["the retired reading_list kind", { kind: "reading_list" }],
    ["a missing kind", { kind: undefined }],
    ["a non-string kind", { kind: 3 }],
  ])("returns null for %s", (_label, override) => {
    expect(toCard({ ...valid, ...override })).toBeNull();
  });

  it("returns null when messages is missing, not an array, or empty", () => {
    expect(toCard({ ...valid, messages: undefined })).toBeNull();
    expect(toCard({ ...valid, messages: "createSurface" })).toBeNull();
    expect(toCard({ ...valid, messages: [] })).toBeNull();
  });

  it("returns null when there are more than eight messages", () => {
    expect(toCard({ ...valid, messages: Array.from({ length: 8 }, () => messages[0]) })).not.toBeNull();
    expect(toCard({ ...valid, messages: Array.from({ length: 9 }, () => messages[0]) })).toBeNull();
  });

  it("returns null when any message is not a plain object", () => {
    expect(toCard({ ...valid, messages: [messages[0], null] })).toBeNull();
    expect(toCard({ ...valid, messages: [messages[0], "text"] })).toBeNull();
    expect(toCard({ ...valid, messages: [messages[0], [1, 2]] })).toBeNull();
  });

  it("cuts a summary longer than 600 characters, rather than rejecting the card", () => {
    const out = toCard({ ...valid, summary: "s".repeat(900) });
    expect(out?.summary).toHaveLength(600);
  });

  it("keeps a summary of exactly 600 characters whole", () => {
    expect(toCard({ ...valid, summary: "s".repeat(600) })?.summary).toHaveLength(600);
  });

  it("does not check the A2UI inside the messages (the renderer does that)", () => {
    const junk = [{ nothing: true }];
    expect(toCard({ ...valid, messages: junk })).toEqual({ ...valid, messages: junk });
  });

  describe("sources", () => {
    it("keeps the citation numbers as given, in order", () => {
      expect(toCard({ ...valid, sources: [2, 4, 5] })?.sources).toEqual([2, 4, 5]);
    });

    it("defaults to an empty list when sources is missing or not an array", () => {
      const { sources: _sources, ...without } = valid;
      expect(toCard(without)?.sources).toEqual([]);
      expect(toCard({ ...valid, sources: "2" })?.sources).toEqual([]);
      expect(toCard({ ...valid, sources: 2 })?.sources).toEqual([]);
    });

    it("keeps only positive integers", () => {
      expect(toCard({ ...valid, sources: [0, -1, 1.5, "3", null, 7, NaN, Infinity] })?.sources).toEqual([7]);
    });

    it("keeps at most twelve sources", () => {
      const out = toCard({ ...valid, sources: Array.from({ length: 20 }, (_, i) => i + 1) });
      expect(out?.sources).toHaveLength(12);
      expect(out?.sources).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    });

    it("keeps a card whose sources are all invalid, with none listed", () => {
      expect(toCard({ ...valid, sources: [0, "x"] })?.sources).toEqual([]);
    });
  });
});

describe("cardLabel", () => {
  it("is Where I did it, and sources for an evidence card", () => {
    expect(cardLabel(card({ kind: "evidence" }))).toBe("Where I did it, and sources");
  });

  it("is Compare table for a compare card", () => {
    expect(cardLabel(card({ kind: "compare", flair: "plain", summary: "[Card shown: compare table of “A”, “B” on “x”]", sources: [] }))).toBe(
      "Compare table"
    );
  });

  it("does not depend on the summary text: the kind decides the label", () => {
    expect(cardLabel(card({ kind: "compare", summary: "[Card shown: where I did it, “Illumina”]" }))).toBe("Compare table");
    expect(cardLabel(card({ kind: "evidence", summary: "[Card shown: compare table of “A”, “B”]" }))).toBe("Where I did it, and sources");
  });
});

describe("historyContent", () => {
  it("returns the reply text unchanged when there is no card", () => {
    expect(historyContent("Here is the answer.")).toBe("Here is the answer.");
  });

  it("appends the card's summary after a blank line", () => {
    expect(historyContent("Here is the answer.", card())).toBe("Here is the answer.\n\n[Card shown: where I did it, “Illumina”; sources [2]]");
  });

  it("keeps the card's messages out of the history", () => {
    expect(historyContent("Answer.", card())).not.toContain("createSurface");
  });
});
