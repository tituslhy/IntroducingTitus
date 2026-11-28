import { clearHighlight, highlightSentence } from "./highlight";

/** A stand-in for the CSS Custom Highlight API, which jsdom does not have. */
class FakeHighlight {
  ranges: Range[];
  constructor(...ranges: Range[]) {
    this.ranges = ranges;
  }
}

type Globals = { CSS?: { highlights?: Map<string, FakeHighlight> }; Highlight?: typeof FakeHighlight };
const g = globalThis as unknown as Globals;

function reply(html: string): HTMLElement {
  const el = document.createElement("article");
  el.innerHTML = html;
  document.body.append(el);
  return el;
}

const marked = () => g.CSS?.highlights?.get("voice-reply")?.ranges.map((r) => r.toString()) ?? null;

describe("highlightSentence", () => {
  let originalCSS: Globals["CSS"];
  beforeEach(() => {
    originalCSS = g.CSS;
    g.CSS = { highlights: new Map() };
    g.Highlight = FakeHighlight;
  });
  afterEach(() => {
    g.CSS = originalCSS;
    delete g.Highlight;
    document.body.innerHTML = "";
  });

  it("marks the sentence in the rendered reply", () => {
    const root = reply("<p>I started at Toyota Tsusho. Then I moved into data science.</p>");
    highlightSentence(root, "Then I moved into data science.");
    expect(marked()).toEqual(["Then I moved into data science."]);
  });

  it("marks a sentence that runs across text nodes, with bold inside it", () => {
    const root = reply("<p>First one. I led the <strong>Illumina</strong> platform work. Last one.</p>");
    highlightSentence(root, "I led the Illumina platform work.");
    expect(marked()).toEqual(["I led the Illumina platform work."]);
  });

  it("finds the sentence when the page's whitespace differs from the plain text", () => {
    const root = reply("<p>One line\n   and   the next.</p>");
    highlightSentence(root, "One line and the next.");
    expect(marked()).toEqual(["One line\n   and   the next."]);
  });

  it("skips citation numbers, which the spoken text leaves out", () => {
    const root = reply('<p>I wrote about agents<sup><a href="#">1</a></sup> and evals.</p>');
    highlightSentence(root, "I wrote about agents and evals.");
    const ranges = g.CSS!.highlights!.get("voice-reply")!.ranges;
    expect(ranges).toHaveLength(1);
    // The range spans the citation; what matters is that it starts and ends on the sentence's words.
    expect(ranges[0].toString()).toBe("I wrote about agents1 and evals.");
  });

  it("moves the mark to the next sentence (one highlight at a time)", () => {
    const root = reply("<p>One. Two.</p>");
    highlightSentence(root, "One.");
    highlightSentence(root, "Two.");
    expect(marked()).toEqual(["Two."]);
  });

  it("clears the mark when the sentence is not on the page", () => {
    const root = reply("<p>One. Two.</p>");
    highlightSentence(root, "One.");
    highlightSentence(root, "Three.");
    expect(marked()).toBeNull();
  });

  it("does nothing without a root", () => {
    expect(() => highlightSentence(null, "One.")).not.toThrow();
    expect(marked()).toBeNull();
  });
});

describe("clearHighlight", () => {
  afterEach(() => {
    delete g.CSS;
    delete g.Highlight;
    document.body.innerHTML = "";
  });

  it("removes the mark", () => {
    g.CSS = { highlights: new Map() };
    g.Highlight = FakeHighlight;
    highlightSentence(reply("<p>One.</p>"), "One.");
    clearHighlight();
    expect(g.CSS.highlights!.has("voice-reply")).toBe(false);
  });

  it("highlightSentence and clearHighlight do nothing where the browser has no CSS.highlights", () => {
    g.CSS = {};
    const root = reply("<p>One.</p>");
    expect(() => highlightSentence(root, "One.")).not.toThrow();
    expect(() => clearHighlight()).not.toThrow();
    delete g.CSS;
    expect(() => highlightSentence(root, "One.")).not.toThrow();
    expect(() => clearHighlight()).not.toThrow();
  });
});
