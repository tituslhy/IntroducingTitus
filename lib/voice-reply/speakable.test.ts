import { PRONUNCIATIONS, speakableSentences, toPlainText } from "@/lib/voice-reply/speakable";

describe("toPlainText", () => {
  it("drops citations and closes the gap they leave", () => {
    expect(toPlainText("I built it [1] and shipped it [2, 3].")).toBe("I built it and shipped it.");
  });

  it("drops run-together citations like [1][2]", () => {
    expect(toPlainText("It scaled [1][2] well.")).toBe("It scaled well.");
  });

  it("keeps the text of a link and drops the address", () => {
    expect(toPlainText("See [my Medium](https://medium.com/@tituslhy).")).toBe("See my Medium.");
  });

  it("keeps a link's text even when it looks like a citation number", () => {
    expect(toPlainText("Read [1](https://x.y/z) first.")).toBe("Read 1 first.");
  });

  it("drops bare URLs and tidies the space they leave", () => {
    expect(toPlainText("Docs at https://x.y/z today.")).toBe("Docs at today.");
  });

  it("keeps the full stop after a bare URL at the end of a sentence", () => {
    expect(toPlainText("The docs are at https://x.y/z.")).toBe("The docs are at.");
  });

  it("strips bold, emphasis and inline code", () => {
    expect(toPlainText("A **bold** and *soft* move with `code` inside.")).toBe(
      "A bold and soft move with code inside.",
    );
  });

  it("strips heading, bullet and numbered-list markers", () => {
    expect(toPlainText("# Title\n\n- one\n- two\n\n1. first\n2. second")).toBe(
      "Title one two first second",
    );
  });

  it("joins paragraphs with a single space", () => {
    expect(toPlainText("First para.\n\nSecond para.")).toBe("First para. Second para.");
  });

  it("joins the wrapped lines of one paragraph with a single space", () => {
    expect(toPlainText("one line\nand the next")).toBe("one line and the next");
  });

  it("leaves code blocks out, since reading code aloud helps nobody", () => {
    expect(toPlainText("Run this:\n\n```bash\nnpm test\n```\n\nThen relax.")).toBe("Run this: Then relax.");
  });

  it("drops the markers of an emphasis that has not closed yet", () => {
    expect(toPlainText("This is **very important.")).toBe("This is very important.");
  });

  it("leaves snake_case words alone", () => {
    expect(toPlainText("Call my_tool_name now.")).toBe("Call my_tool_name now.");
  });
});

describe("speakableSentences", () => {
  it("holds back a trailing fragment without a full stop while streaming", () => {
    expect(speakableSentences("One. Two", { final: false })).toEqual([
      { index: 0, shown: "One.", spoken: "One." },
    ]);
  });

  it("releases that fragment once the reply is final", () => {
    expect(speakableSentences("One. Two", { final: true })).toEqual([
      { index: 0, shown: "One.", spoken: "One." },
      { index: 1, shown: "Two", spoken: "Two" },
    ]);
  });

  it("returns nothing for an empty reply", () => {
    expect(speakableSentences("", { final: true })).toEqual([]);
  });

  it("splits on question marks, exclamation marks and ellipses", () => {
    const out = speakableSentences("Really? Yes! Well… Maybe. Done", { final: true });
    expect(out.map((s) => s.shown)).toEqual(["Really?", "Yes!", "Well…", "Maybe.", "Done"]);
  });

  it("splits before an opening quote", () => {
    const out = speakableSentences('I said so. "Then do it." Fine.', { final: true });
    expect(out.map((s) => s.shown)).toEqual(["I said so.", '"Then do it."', "Fine."]);
  });

  it("does not split before a lowercase word", () => {
    const out = speakableSentences("It works, e.g. on phones. Next.", { final: true });
    expect(out.map((s) => s.shown)).toEqual(["It works, e.g. on phones.", "Next."]);
  });

  it("splits on a paragraph break even without a full stop", () => {
    const out = speakableSentences("A heading\n\nThen some text.", { final: true });
    expect(out.map((s) => s.shown)).toEqual(["A heading", "Then some text."]);
  });

  it("makes each list item its own sentence", () => {
    const out = speakableSentences("- Built the loop\n- Shipped the drawer\n- Wrote the tests", { final: true });
    expect(out.map((s) => s.shown)).toEqual(["Built the loop", "Shipped the drawer", "Wrote the tests"]);
  });

  it("treats a paragraph that a blank line has closed as complete while streaming", () => {
    const out = speakableSentences("A heading\n\nStill typing", { final: false });
    expect(out.map((s) => s.shown)).toEqual(["A heading"]);
  });

  it("does not split on an abbreviation or a decimal", () => {
    const out = speakableSentences("It cut errors by 80.5 percent at U.S. banks.", { final: false });
    expect(out).toHaveLength(1);
    expect(out[0].shown).toBe("It cut errors by 80.5 percent at U.S. banks.");
  });

  it("does not split after a single capital letter even before a capital", () => {
    const out = speakableSentences("It ran at U.S. Bank. Then it stopped.", { final: true });
    expect(out.map((s) => s.shown)).toEqual(["It ran at U.S. Bank.", "Then it stopped."]);
  });

  it("holds back a trailing number's full stop, since a decimal may be coming", () => {
    expect(speakableSentences("It cut errors by 80.", { final: false })).toEqual([]);
    expect(speakableSentences("It cut errors by 80.", { final: true })).toHaveLength(1);
  });

  it("holds back a trailing 'U.' too, for the same reason", () => {
    expect(speakableSentences("It cut errors at U.", { final: false })).toEqual([]);
  });

  it("does not let a trailing scrap with nothing to say hide the sentence before it", () => {
    expect(speakableSentences('One. "', { final: false }).map((s) => s.shown)).toEqual(["One."]);
  });

  it("releases a trailing sentence that ends in a full stop", () => {
    const out = speakableSentences("Done.", { final: false });
    expect(out.map((s) => s.shown)).toEqual(["Done."]);
  });

  it("keeps index and shown stable as the text grows", () => {
    const text = "I built it [1]. It **worked**. Then I wrote about it. And shipped";
    const full = speakableSentences(text, { final: true });
    for (let n = 1; n <= text.length; n++) {
      const part = speakableSentences(text.slice(0, n), { final: false });
      part.forEach((s, i) => expect(s).toEqual(full[i]));
    }
    expect(full.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("keeps an emphasised sentence's text the same before and after the marker closes", () => {
    const early = speakableSentences("**Very important.", { final: false });
    const later = speakableSentences("**Very important.** Next one.", { final: true });
    expect(early[0]).toEqual(later[0]);
  });

  it("shows the plain text as displayed", () => {
    const [first] = speakableSentences("I use [LlamaIndex](https://x.y) at **UOB** [1]. Next.", { final: true });
    expect(first.shown).toBe("I use LlamaIndex at UOB.");
  });

  it("applies the pronunciation map to what is spoken, not to what is shown", () => {
    const [s] = speakableSentences("I built LlamaIndex pipelines at UOB.", { final: true });
    expect(s.shown).toBe("I built LlamaIndex pipelines at UOB.");
    expect(s.spoken).toBe("I built Llama Index pipelines at U O B.");
  });

  it("applies the map to whole words only", () => {
    const [s] = speakableSentences("UOBX is not UOB.", { final: true });
    expect(s.spoken).toBe("UOBX is not U O B.");
  });

  it("drops a block that has nothing to say once markdown is stripped", () => {
    expect(speakableSentences("Intro.\n\n---\n\nOutro.", { final: true }).map((s) => s.shown)).toEqual([
      "Intro.",
      "Outro.",
    ]);
    expect(speakableSentences("See https://x.y/z", { final: true })).toEqual([
      { index: 0, shown: "See", spoken: "See" },
    ]);
  });
});

describe("PRONUNCIATIONS", () => {
  const apply = (s: string) => PRONUNCIATIONS.reduce((t, [re, to]) => t.replace(re, to), s);

  it("spells out UOB", () => {
    expect(apply("UOB")).toBe("U O B");
  });

  it("splits LlamaIndex into two words", () => {
    expect(apply("LlamaIndex")).toBe("Llama Index");
  });

  it("matches whole words only", () => {
    expect(apply("UOBX")).toBe("UOBX");
    expect(apply("MyLlamaIndexes")).toBe("MyLlamaIndexes");
  });

  it("works more than once on the same text", () => {
    expect(apply("UOB and UOB")).toBe("U O B and U O B");
  });
});
