import {
  foldSteps,
  MAX_HEADLINE_CHARS,
  PAGE_MOVE_STEP_ID,
  pageMoveStep,
  summaryHeadline,
  toStep,
  upsertStep,
  type Step,
} from "./copilot-steps";

const search = (id: string, done: boolean, label = "Searching my writing for “a”"): Step => ({
  id,
  tool: "search_writing",
  label,
  done,
});
const read = (id: string, done: boolean): Step => ({ id, tool: "read_writing", label: "Reading “T”", done });

describe("toStep", () => {
  it("keeps a well-formed step event, with its fields", () => {
    expect(toStep({ id: "c1", tool: "search_writing", label: "Searching my writing for “a”", done: false })).toEqual({
      id: "c1",
      tool: "search_writing",
      label: "Searching my writing for “a”",
      done: false,
    });
  });

  it("keeps a finished step", () => {
    expect(toStep({ id: "c1", tool: "read_writing", label: "Read “T”", done: true })).toMatchObject({ done: true });
  });

  it("drops the event when the id is missing or not a string", () => {
    expect(toStep({ tool: "search_writing", label: "x", done: false })).toBeNull();
    expect(toStep({ id: 7, tool: "search_writing", label: "x", done: false })).toBeNull();
  });

  it("drops the event when the tool is missing or not a string", () => {
    expect(toStep({ id: "c1", label: "x", done: false })).toBeNull();
    expect(toStep({ id: "c1", tool: null, label: "x", done: false })).toBeNull();
  });

  it("drops the event when the label is missing or not a string", () => {
    expect(toStep({ id: "c1", tool: "search_writing", done: false })).toBeNull();
    expect(toStep({ id: "c1", tool: "search_writing", label: 3, done: false })).toBeNull();
  });

  it("drops the event when done is missing or not a boolean", () => {
    expect(toStep({ id: "c1", tool: "search_writing", label: "x" })).toBeNull();
    expect(toStep({ id: "c1", tool: "search_writing", label: "x", done: "yes" })).toBeNull();
    expect(toStep({ id: "c1", tool: "search_writing", label: "x", done: 1 })).toBeNull();
  });

  it("drops the event when the id or the label is empty, as there is nothing to show", () => {
    expect(toStep({ id: "", tool: "search_writing", label: "x", done: false })).toBeNull();
    expect(toStep({ id: "c1", tool: "search_writing", label: "", done: false })).toBeNull();
  });

  it("ignores extra fields the server did not need to send", () => {
    expect(toStep({ id: "c1", tool: "search_writing", label: "x", done: false, extra: 1 } as never)).toEqual({
      id: "c1",
      tool: "search_writing",
      label: "x",
      done: false,
    });
  });
});

describe("upsertStep", () => {
  it("adds a new step at the end", () => {
    const steps = [search("c1", false)];
    expect(upsertStep(steps, read("c2", false))).toEqual([search("c1", false), read("c2", false)]);
  });

  it("replaces the step with the same id, keeping its place in the order", () => {
    const steps = [search("c1", false), read("c2", false)];
    const finished = search("c1", true, "Searched my writing for “a”");
    expect(upsertStep(steps, finished)).toEqual([finished, read("c2", false)]);
  });

  it("does not change the list it was given", () => {
    const steps = [search("c1", false)];
    upsertStep(steps, search("c1", true));
    expect(steps).toEqual([search("c1", false)]);
  });

  it("starts a list from nothing", () => {
    expect(upsertStep([], search("c1", false))).toEqual([search("c1", false)]);
  });
});

describe("foldSteps", () => {
  it("gives null when there were no steps", () => {
    expect(foldSteps([], 3)).toBeNull();
  });

  it("says it searched and read the articles it sent", () => {
    expect(foldSteps([search("c1", true)], 3)).toBe("Searched my writing · read 3 articles");
  });

  it("uses the singular for one article", () => {
    expect(foldSteps([search("c1", true)], 1)).toBe("Searched my writing · read 1 article");
  });

  it("says only that it searched when it sent no articles", () => {
    expect(foldSteps([search("c1", true)], 0)).toBe("Searched my writing");
  });

  it("says it read articles by id when no search ran", () => {
    expect(foldSteps([read("c1", true)], 1)).toBe("Read 1 article");
    expect(foldSteps([read("c1", true)], 2)).toBe("Read 2 articles");
  });

  it("gives null when only reads ran and no article was sent", () => {
    expect(foldSteps([read("c1", true)], 0)).toBeNull();
  });

  it("counts a search and a read together under one search line", () => {
    expect(foldSteps([search("c1", true), read("c2", true)], 4)).toBe("Searched my writing · read 4 articles");
  });

  it("folds a step that is still pending the same way", () => {
    expect(foldSteps([search("c1", false)], 2)).toBe("Searched my writing · read 2 articles");
  });
});

describe("summaryHeadline", () => {
  it("returns the bold title a reasoning summary opens with", () => {
    expect(summaryHeadline("**Looking up the Illumina role**\n\nI need to check the dates first.")).toBe("Looking up the Illumina role");
  });

  it("trims spaces inside the bold markers", () => {
    expect(summaryHeadline("**  Looking up the role  **\n\nDetails")).toBe("Looking up the role");
  });

  it("allows whitespace before the title", () => {
    expect(summaryHeadline("  \n\t**Checking my writing**\n\nDetails")).toBe("Checking my writing");
  });

  it("returns a title that is a title on its own, with no body after it", () => {
    expect(summaryHeadline("**Just a title**")).toBe("Just a title");
  });

  it("gives null when the summary has no bold title", () => {
    expect(summaryHeadline("I need to check the dates first.")).toBeNull();
  });

  it("gives null when the bold title does not open the summary", () => {
    expect(summaryHeadline("Some words first **Not the title**")).toBeNull();
  });

  it("gives null when the bold title is never closed", () => {
    expect(summaryHeadline("**Looking up the role without an end")).toBeNull();
  });

  it("gives null for an empty title, or one that is only spaces", () => {
    expect(summaryHeadline("****")).toBeNull();
    expect(summaryHeadline("**   **\n\nDetails")).toBeNull();
  });

  it("gives null for a title that runs over a line break", () => {
    expect(summaryHeadline("**Looking up\nthe role**\n\nDetails")).toBeNull();
  });

  it("gives null for a title with a stray asterisk inside it", () => {
    expect(summaryHeadline("**a*b**\n\nDetails")).toBeNull();
  });

  it("gives null for an empty summary", () => {
    expect(summaryHeadline("")).toBeNull();
  });

  it("keeps a title of exactly MAX_HEADLINE_CHARS characters", () => {
    const title = "t".repeat(MAX_HEADLINE_CHARS);
    expect(MAX_HEADLINE_CHARS).toBe(90);
    expect(summaryHeadline(`**${title}**\n\nDetails`)).toBe(title);
  });

  it("skips a title one character over the limit, rather than truncating it", () => {
    expect(summaryHeadline(`**${"t".repeat(MAX_HEADLINE_CHARS + 1)}**\n\nDetails`)).toBeNull();
  });
});

describe("pageMoveStep", () => {
  it("says it went to a place on another page", () => {
    expect(pageMoveStep({ page: "Experience", label: "Mastercard" }, false)).toEqual({
      id: PAGE_MOVE_STEP_ID,
      tool: "show_on_page",
      label: "Went to Mastercard on the Experience page",
      done: true,
    });
  });

  it("says it went to a page when the place is the page itself", () => {
    expect(pageMoveStep({ page: "Writing", label: "Writing" }, false).label).toBe("Went to the Writing page");
  });

  it("says it scrolled when the place is on the page it is already on", () => {
    expect(pageMoveStep({ page: "Experience", label: "Mastercard" }, true).label).toBe("Scrolled to Mastercard");
  });

  it("is always done, with the show_on_page tool and the fixed page-move id", () => {
    const step = pageMoveStep({ page: "About", label: "Tools" }, false);
    expect(step).toMatchObject({ id: "page-move", tool: "show_on_page", done: true });
    expect(PAGE_MOVE_STEP_ID).toBe("page-move");
  });

  it("says how many articles the Writing page was filtered to", () => {
    expect(pageMoveStep({ page: "Writing", label: "Writing" }, false, 3).label).toBe(
      "Filtered the Writing page to 3 articles",
    );
  });

  it("uses the singular for a pick of one article", () => {
    expect(pageMoveStep({ page: "Writing", label: "Writing" }, false, 1).label).toBe(
      "Filtered the Writing page to 1 article",
    );
  });

  it("gives the pick wording over the same-page wording", () => {
    expect(pageMoveStep({ page: "Writing", label: "Writing" }, true, 2).label).toBe(
      "Filtered the Writing page to 2 articles",
    );
  });

  it("treats a pick of zero as no pick", () => {
    expect(pageMoveStep({ page: "Writing", label: "Writing" }, false, 0).label).toBe("Went to the Writing page");
  });
});

describe("foldSteps with a page move", () => {
  const moved = (label: string): Step => ({ id: PAGE_MOVE_STEP_ID, tool: "show_on_page", label, done: true });

  it("appends the page move after the search and read counts, in lower case", () => {
    expect(
      foldSteps(
        [search("c1", true), moved("Went to Mastercard on the Experience page")],
        3,
      ),
    ).toBe("Searched my writing · read 3 articles · went to Mastercard on the Experience page");
  });

  it("appends the page move after a read-only line", () => {
    expect(foldSteps([read("c1", true), moved("Went to the Writing page")], 2)).toBe(
      "Read 2 articles · went to the Writing page",
    );
  });

  it("keeps the page move as it is when it stands alone", () => {
    expect(foldSteps([moved("Went to the Writing page")], 0)).toBe("Went to the Writing page");
  });

  it("lowers the first letter of a pick line that follows other parts", () => {
    expect(foldSteps([search("c1", true), moved("Filtered the Writing page to 2 articles")], 2)).toBe(
      "Searched my writing · read 2 articles · filtered the Writing page to 2 articles",
    );
  });

  it("gives the page move alone when there were no searches or articles", () => {
    expect(foldSteps([moved("Scrolled to Tools")], 0)).toBe("Scrolled to Tools");
  });

  it("does not add a page move that never happened", () => {
    expect(foldSteps([search("c1", true)], 1)).toBe("Searched my writing · read 1 article");
  });
});
