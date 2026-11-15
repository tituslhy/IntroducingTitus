import type { Section } from "@/lib/article-sections";
import { missingSectionKeys, mergeSectionNotes } from "@/lib/section-notes";

const section = (key: string, heading: string | null = key === "(intro)" ? null : key): Section => ({
  key,
  heading,
  body: `Body of ${key}`,
});

const SECTIONS: Section[] = [section("(intro)"), section("Retrieval"), section("Evaluation"), section("Wrap up")];

describe("missingSectionKeys", () => {
  it("lists only keys without a note", () => {
    const notes = { Retrieval: "Covers hybrid search", "Wrap up": "Closing advice" };

    expect(missingSectionKeys(SECTIONS, notes)).toEqual(["(intro)", "Evaluation"]);
  });

  it("returns every key when notes is undefined", () => {
    expect(missingSectionKeys(SECTIONS, undefined)).toEqual(["(intro)", "Retrieval", "Evaluation", "Wrap up"]);
  });

  it("returns no keys when every section has a note", () => {
    const notes = { "(intro)": "a", Retrieval: "b", Evaluation: "c", "Wrap up": "d" };

    expect(missingSectionKeys(SECTIONS, notes)).toEqual([]);
  });

  it("counts an empty or whitespace-only note as missing", () => {
    const notes = { "(intro)": "", Retrieval: "   ", Evaluation: "\n\t", "Wrap up": "Real note" };

    expect(missingSectionKeys(SECTIONS, notes)).toEqual(["(intro)", "Retrieval", "Evaluation"]);
  });

  it("returns keys in section order, not the order of the notes object", () => {
    const notes = { "Wrap up": "x" };

    expect(missingSectionKeys(SECTIONS, notes)).toEqual(["(intro)", "Retrieval", "Evaluation"]);
  });

  it("handles the (intro) key like any other section", () => {
    expect(missingSectionKeys([section("(intro)")], {})).toEqual(["(intro)"]);
    expect(missingSectionKeys([section("(intro)")], { "(intro)": "Opening" })).toEqual([]);
  });

  it("returns nothing for an article with no sections", () => {
    expect(missingSectionKeys([], { Retrieval: "x" })).toEqual([]);
  });

  it("does not mutate its inputs", () => {
    const notes = { Retrieval: "   " };
    const before = JSON.stringify({ SECTIONS, notes });

    missingSectionKeys(SECTIONS, notes);

    expect(JSON.stringify({ SECTIONS, notes })).toBe(before);
  });
});

describe("mergeSectionNotes", () => {
  const keys = ["(intro)", "Retrieval", "Evaluation"];

  it("merge keeps existing notes and never overwrites them", () => {
    const existing = { Retrieval: "Hand-written note" };
    const drafted = { Retrieval: "Model draft that must lose", Evaluation: "Model note" };

    const merged = mergeSectionNotes(existing, drafted, keys);

    expect(merged.Retrieval).toBe("Hand-written note");
    expect(merged.Evaluation).toBe("Model note");
  });

  it("merge drops notes for sections that no longer exist", () => {
    const existing = { Retrieval: "Kept", "Removed section": "Stale note" };
    const drafted = { "Also removed": "Ignored draft", Evaluation: "New note" };

    const merged = mergeSectionNotes(existing, drafted, keys);

    expect(merged).toEqual({ Retrieval: "Kept", Evaluation: "New note" });
    expect(merged).not.toHaveProperty("Removed section");
    expect(merged).not.toHaveProperty("Also removed");
  });

  it("merge with no existing notes returns drafted notes for the given keys only", () => {
    const drafted = { "(intro)": "Opening", Evaluation: "Note", "Not a key": "Ignored" };

    expect(mergeSectionNotes(undefined, drafted, keys)).toEqual({ "(intro)": "Opening", Evaluation: "Note" });
  });

  it("omits a key that has neither an existing nor a drafted note", () => {
    const merged = mergeSectionNotes({ Retrieval: "Kept" }, {}, keys);

    expect(merged).toEqual({ Retrieval: "Kept" });
    expect(Object.keys(merged)).not.toContain("Evaluation");
  });

  it("treats a blank existing note as missing, so the drafted note fills it", () => {
    const merged = mergeSectionNotes({ Retrieval: "   " }, { Retrieval: "Drafted" }, keys);

    expect(merged.Retrieval).toBe("Drafted");
  });

  it("omits a key whose existing and drafted notes are both blank", () => {
    const merged = mergeSectionNotes({ Retrieval: "" }, { Retrieval: "  \n " }, keys);

    expect(merged).not.toHaveProperty("Retrieval");
  });

  it("trims a drafted note before storing it", () => {
    expect(mergeSectionNotes(undefined, { Evaluation: "  Padded note  " }, keys)).toEqual({ Evaluation: "Padded note" });
  });

  it("does not trim or change an existing note that is kept", () => {
    expect(mergeSectionNotes({ Evaluation: "  Kept as written " }, {}, keys)).toEqual({ Evaluation: "  Kept as written " });
  });

  it("result key order follows keys, not the order of the inputs", () => {
    const existing = { Evaluation: "E" };
    const drafted = { Retrieval: "R", "(intro)": "I" };

    expect(Object.keys(mergeSectionNotes(existing, drafted, keys))).toEqual(["(intro)", "Retrieval", "Evaluation"]);
  });

  it("does not mutate its inputs", () => {
    const existing = { Retrieval: "Kept", Stale: "gone" };
    const drafted = { Evaluation: "New" };
    const before = JSON.stringify({ existing, drafted, keys });

    mergeSectionNotes(existing, drafted, keys);

    expect(JSON.stringify({ existing, drafted, keys })).toBe(before);
  });
});
