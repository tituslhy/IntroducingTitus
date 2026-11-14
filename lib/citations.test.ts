// react-markdown ships ESM only, which Jest does not transform. citations.ts
// needs just its URL sanitiser, so this stub follows the library's default
// rules: http, https, mailto and tel pass; anything else becomes "".
jest.mock("react-markdown", () => ({
  __esModule: true,
  defaultUrlTransform: (value: string) => {
    const colon = value.indexOf(":");
    if (colon === -1) return value;
    const protocol = value.slice(0, colon + 1).toLowerCase();
    return /^(https?|ircs?|mailto|xmpp|tel)?:$/.test(protocol) ? value : "";
  },
}));

import {
  CITE_SCHEME,
  MAX_CITATIONS,
  citationUrlTransform,
  collectCitations,
  linkCitations,
  sourceForHref,
  toSource,
} from "./citations";

describe("linkCitations", () => {
  it("turns a bare [n] marker into a cite: link", () => {
    expect(linkCitations("Solo, sixteen components [1].")).toBe("Solo, sixteen components [1](cite:1).");
  });

  it("handles two-digit numbers and several markers in one line", () => {
    expect(linkCitations("A [2] and B [12].")).toBe("A [2](cite:2) and B [12](cite:12).");
  });

  it("leaves [n] inside inline code alone", () => {
    expect(linkCitations("Use `items[1]` or `[1]` here.")).toBe("Use `items[1]` or `[1]` here.");
  });

  it("leaves [n] inside fenced code blocks alone, but links it outside them", () => {
    const input = "Before [1].\n```\nconst x = arr[1] + [2];\n```\nAfter [2].";
    expect(linkCitations(input)).toBe(
      "Before [1](cite:1).\n```\nconst x = arr[1] + [2];\n```\nAfter [2](cite:2)."
    );
  });

  it("leaves index-like text such as arr[1] alone", () => {
    expect(linkCitations("Read arr[1] first.")).toBe("Read arr[1] first.");
  });

  it("leaves real Markdown links such as [1](https://…) alone", () => {
    const input = "See [1](https://example.com/a) for details.";
    expect(linkCitations(input)).toBe(input);
  });

  it("leaves a real Markdown link with a marker as its text untouched", () => {
    expect(linkCitations("[1](https://example.com/a)")).toBe("[1](https://example.com/a)");
    expect(linkCitations("[1](cite:1)")).toBe("[1](cite:1)");
  });

  it("links adjacent markers, as models write them: [1][2] becomes two footnotes", () => {
    expect(linkCitations("Both say so [1][2].")).toBe("Both say so [1](cite:1)[2](cite:2).");
  });

  it("links markers before punctuation and in comma-separated lists", () => {
    expect(linkCitations("see [1].")).toBe("see [1](cite:1).");
    expect(linkCitations("[1], [2]")).toBe("[1](cite:1), [2](cite:2)");
  });

  it("leaves a doubly bracketed [[1]] alone", () => {
    expect(linkCitations("see [[1]]")).toBe("see [[1]]");
  });

  it("returns text without markers unchanged", () => {
    expect(linkCitations("Nothing to cite here.")).toBe("Nothing to cite here.");
  });
});

describe("toSource", () => {
  const valid = { n: 1, title: "Guardrails in practice", url: "https://medium.com/@tituslhy/guardrails" };

  it("accepts a well-formed https source", () => {
    expect(toSource(valid)).toEqual(valid);
  });

  it("accepts an http source", () => {
    expect(toSource({ ...valid, url: "http://example.com/a" })).toEqual({ ...valid, url: "http://example.com/a" });
  });

  it.each([
    ["a fractional n", { n: 1.5 }],
    ["zero", { n: 0 }],
    ["a negative n", { n: -2 }],
    ["a string n", { n: "1" }],
    ["a missing n", { n: undefined }],
  ])("rejects %s", (_label, override) => {
    expect(toSource({ ...valid, ...override })).toBeNull();
  });

  it("rejects an empty title", () => {
    expect(toSource({ ...valid, title: "" })).toBeNull();
  });

  it("rejects a non-string title", () => {
    expect(toSource({ ...valid, title: 42 })).toBeNull();
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["data:", "data:text/html,<script>alert(1)</script>"],
    ["mailto:", "mailto:someone@example.com"],
    ["a relative path", "/writing/guardrails"],
    ["an unparseable URL", "not a url"],
  ])("rejects a URL with %s", (_label, url) => {
    expect(toSource({ ...valid, url })).toBeNull();
  });

  it("rejects a missing URL", () => {
    expect(toSource({ n: 1, title: "t" })).toBeNull();
  });
});

describe("citationUrlTransform", () => {
  it("keeps cite: links so the renderer can draw footnotes", () => {
    expect(citationUrlTransform(`${CITE_SCHEME}3`)).toBe("cite:3");
  });

  it("still strips javascript: URLs", () => {
    expect(citationUrlTransform("javascript:alert(1)")).toBe("");
  });

  it("still keeps ordinary https links", () => {
    expect(citationUrlTransform("https://example.com/")).toBe("https://example.com/");
  });
});

describe("sourceForHref", () => {
  const sources = [
    { n: 1, title: "First", url: "https://example.com/1" },
    { n: 2, title: "Second", url: "https://example.com/2" },
  ];

  it("returns the source a cite: href points at", () => {
    expect(sourceForHref("cite:2", sources)).toEqual(sources[1]);
  });

  it("returns null for a number the server never sent", () => {
    expect(sourceForHref("cite:9", sources)).toBeNull();
  });

  it("returns null for a non-cite href", () => {
    expect(sourceForHref("https://example.com/2", sources)).toBeNull();
    expect(sourceForHref(undefined, sources)).toBeNull();
  });

  it("returns null when there are no sources", () => {
    expect(sourceForHref("cite:1", undefined)).toBeNull();
    expect(sourceForHref("cite:1", [])).toBeNull();
  });
});

describe("collectCitations", () => {
  /** A source as the drawer holds it: title and URL on the message, number on the footnote. */
  const cite = (n: number, slug: string) => ({ n, title: `Title ${slug}`, url: `https://medium.com/@tituslhy/${slug}` });
  const urlOf = (slug: string) => `https://medium.com/@tituslhy/${slug}`;

  it("returns nothing when there are no messages", () => {
    expect(collectCitations([])).toEqual([]);
  });

  it("returns nothing when no message has sources, whether the field is absent or empty", () => {
    expect(collectCitations([{}, { sources: [] }, { sources: undefined }])).toEqual([]);
  });

  it("sends only the number and link, not the title", () => {
    expect(collectCitations([{ sources: [cite(1, "a")] }])).toEqual([{ n: 1, url: urlOf("a") }]);
  });

  it("dedupes by number: a number reused for a different article keeps the first article", () => {
    expect(collectCitations([{ sources: [cite(1, "a")] }, { sources: [cite(1, "b")] }])).toEqual([
      { n: 1, url: urlOf("a") },
    ]);
  });

  it("dedupes by URL: an article under a second number keeps its first number", () => {
    expect(collectCitations([{ sources: [cite(1, "a")] }, { sources: [cite(2, "a")] }])).toEqual([
      { n: 1, url: urlOf("a") },
    ]);
  });

  it("keeps the first entry seen across messages, and still takes a later article under a free number", () => {
    const messages = [{ sources: [cite(3, "a")] }, { sources: [cite(3, "b"), cite(4, "b")] }];
    expect(collectCitations(messages)).toEqual([
      { n: 3, url: urlOf("a") },
      { n: 4, url: urlOf("b") },
    ]);
  });

  it("collects from every message, not just the latest", () => {
    const messages = [{ sources: [cite(1, "a")] }, { content: "no sources here" }, { sources: [cite(2, "b")] }];
    expect(collectCitations(messages)).toEqual([
      { n: 1, url: urlOf("a") },
      { n: 2, url: urlOf("b") },
    ]);
  });

  it("follows message order, then source order within a message, not number order", () => {
    const messages = [{ sources: [cite(3, "c"), cite(1, "a")] }, { sources: [cite(2, "b")] }];
    expect(collectCitations(messages).map((r) => r.n)).toEqual([3, 1, 2]);
  });

  it("caps the result at MAX_CITATIONS (40), keeping the first 40", () => {
    expect(MAX_CITATIONS).toBe(40);
    const sources = Array.from({ length: 45 }, (_, i) => cite(i + 1, `p${i + 1}`));
    const refs = collectCitations([{ sources }]);
    expect(refs).toHaveLength(40);
    expect(refs[0]).toEqual({ n: 1, url: urlOf("p1") });
    expect(refs[39]).toEqual({ n: 40, url: urlOf("p40") });
  });

  it("does not count duplicates towards the cap", () => {
    const sources = Array.from({ length: 40 }, (_, i) => [cite(i + 1, `p${i + 1}`), cite(i + 1, `p${i + 1}`)]).flat();
    const refs = collectCitations([{ sources }]);
    expect(refs).toHaveLength(40);
    expect(refs.at(-1)).toEqual({ n: 40, url: urlOf("p40") });
  });
});
