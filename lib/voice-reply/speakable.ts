/**
 * Turns a streaming markdown reply into the sentences to read aloud. Pure text in, text out:
 * the hook that calls this on every streamed delta uses `index` to know which sentences it has
 * already sent to the voice, `shown` to highlight the sentence in the rendered reply, and
 * `spoken` as the text the voice is given.
 */

export type Sentence = {
  /** Position in the reply. Stays the same as the text grows, so the caller can resume from it. */
  index: number;
  /** The sentence as the reader sees it once markdown is stripped. */
  shown: string;
  /** `shown` with the pronunciation map applied: what the voice says. */
  spoken: string;
};

/**
 * Words the voice gets wrong, mapped to something it gets right. Whole words only, so
 * "UOBX" is left alone. Starts with the two that are known to need it; more are added
 * once the voice is picked by ear.
 */
export const PRONUNCIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bUOB\b/g, "U O B"],
  [/\bLlamaIndex\b/g, "Llama Index"],
];

/** A block of markdown (paragraph, heading or list item) and whether more text can still join it. */
type Block = { text: string; closed: boolean };

const HEADING = /^\s{0,3}#{1,6}\s+/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^\s*(?:```|~~~)/;

/**
 * Splits markdown into blocks. A heading or list item is a block on its own; other lines join
 * the paragraph above until a blank line. Fenced code is dropped (reading code aloud helps
 * nobody), including a fence the stream has not closed yet.
 */
function toBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  // The empty string after a trailing newline is not a blank line, just the end of the text.
  if (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();

  const blocks: Block[] = [];
  let open = false;
  let inFence = false;

  const closeCurrent = () => {
    if (blocks.length > 0) blocks[blocks.length - 1].closed = true;
    open = false;
  };
  const start = (text: string, stayOpen: boolean) => {
    closeCurrent();
    blocks.push({ text, closed: false });
    open = stayOpen;
  };

  for (const line of lines) {
    if (FENCE.test(line)) {
      inFence = !inFence;
      closeCurrent();
      continue;
    }
    if (inFence) continue;

    if (line.trim() === "" || RULE.test(line)) {
      closeCurrent();
    } else if (HEADING.test(line)) {
      start(line.replace(HEADING, ""), false);
    } else if (LIST_ITEM.test(line)) {
      start(line.replace(LIST_ITEM, ""), true);
    } else {
      const text = line.replace(/^\s*>\s?/, "");
      if (open) blocks[blocks.length - 1].text += ` ${text}`;
      else start(text, true);
    }
  }
  return blocks;
}

/** Strips inline markdown from one block and tidies the spacing. */
function inlineToPlain(text: string): string {
  return (
    text
      // Images carry nothing to say; links keep their text. Links go first so [1](url) stays a link.
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      // Citations: [1], [2, 3], [1][2], with the space before them.
      .replace(/(?:\s*\[\d+(?:\s*,\s*\d+)*\])+/g, "")
      // Bare URLs, leaving any full stop that ends the sentence.
      .replace(/https?:\/\/[^\s]*[^\s.,;:!?)\]]/g, "")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
      .replace(/\*(?=\S)([^*]+?)(?<=\S)\*/g, "$1")
      .replace(/(?<![\w])_(?=\S)([^_]+?)(?<=\S)_(?![\w])/g, "$1")
      // Markers an unfinished stream has not closed yet, so a sentence reads the same before and after.
      .replace(/\*+(?=\S)|(?<=\S)\*+/g, "")
      .replace(/`/g, "")
      .replace(/\s+/g, " ")
      .replace(/\s+([.,;:!?])/g, "$1")
      .trim()
  );
}

/** The reply as plain text: what the reader sees, minus markdown, links' addresses and citations. */
export function toPlainText(markdown: string): string {
  return toBlocks(markdown)
    .map((b) => inlineToPlain(b.text))
    .filter(Boolean)
    .join(" ");
}

// A sentence ends at . ? ! or … (plus closing quotes), then whitespace, then a capital or an opening quote.
const BOUNDARY = /([.?!…]+)(["”’')\]]*)(\s+)(?=[\p{Lu}"“‘'])/gu;
// A single letter before the full stop is an initial or an abbreviation ("U.S.", "e.g."), not an ending.
const INITIAL = /(?<![\p{L}])\p{L}$/u;
// A trailing "80." may be about to become "80.5", and a trailing "U." is about to become "U.S.".
const MAY_CONTINUE = /(?:\d|(?<![\p{L}])\p{L})\.["”’')\]]*$/u;
const ENDS_SENTENCE = /[.?!…]["”’')\]]*$/;

/** Splits one block's plain text into sentences; flags whether the last one clearly ends. */
function splitSentences(text: string): { sentences: string[]; lastIsClear: boolean } {
  const sentences: string[] = [];
  let from = 0;
  for (const m of text.matchAll(BOUNDARY)) {
    const stop = m.index + m[1].length;
    if (m[1] === "." && INITIAL.test(text.slice(from, m.index))) continue;
    sentences.push(text.slice(from, stop + m[2].length));
    from = m.index + m[0].length;
  }
  sentences.push(text.slice(from));
  const last = sentences[sentences.length - 1].trim();
  const kept = sentences.map((s) => s.trim()).filter((s) => /[\p{L}\p{N}]/u.test(s));
  // A trailing scrap with nothing to say (a lone opening quote, say) is dropped, not held, so it can't hide a real sentence.
  const lastIsScrap = kept[kept.length - 1] !== last;
  return {
    sentences: kept,
    lastIsClear: lastIsScrap || (ENDS_SENTENCE.test(last) && !MAY_CONTINUE.test(last)),
  };
}

function pronounce(text: string): string {
  return PRONUNCIATIONS.reduce((t, [pattern, say]) => t.replace(pattern, say), text);
}

/**
 * The sentences of a reply so far. While the reply is still streaming (`final: false`) the
 * last sentence is held back until it clearly ends, so a sentence is never spoken half-written;
 * a block that a blank line or the next block has closed is always complete.
 */
export function speakableSentences(markdown: string, opts: { final: boolean }): Sentence[] {
  const out: Sentence[] = [];
  for (const block of toBlocks(markdown)) {
    const plain = inlineToPlain(block.text);
    if (!plain) continue;

    const { sentences, lastIsClear } = splitSentences(plain);
    const holdLast = !opts.final && !block.closed && !lastIsClear;
    const ready = holdLast ? sentences.slice(0, -1) : sentences;
    for (const shown of ready) {
      out.push({ index: out.length, shown, spoken: pronounce(shown) });
    }
  }
  return out;
}
