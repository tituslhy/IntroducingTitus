/**
 * The soft amber wash on the sentence being spoken, drawn with the CSS Custom Highlight API so the rendered
 * markdown is never touched (no wrapping spans for React to fight). Where the browser lacks the API, nothing is
 * drawn and speech plays as usual. The colour lives in app/globals.css (`::highlight(voice-reply)`).
 */

const NAME = "voice-reply";

interface HighlightRegistry {
  set(name: string, highlight: unknown): unknown;
  delete(name: string): boolean;
}
type HighlightConstructor = new (...ranges: Range[]) => unknown;

function api(): { registry: HighlightRegistry; Highlight: HighlightConstructor } | null {
  const g = globalThis as { CSS?: { highlights?: HighlightRegistry }; Highlight?: HighlightConstructor };
  const registry = g.CSS?.highlights;
  if (!registry || typeof g.Highlight !== "function") return null;
  return { registry, Highlight: g.Highlight };
}

/** Citation numbers and buttons are not part of what is read aloud, so they are left out of the search. */
const SKIP = "sup, button";

/**
 * Marks `shown` (a sentence as speakableSentences gives it: plain text, single spaces) inside `root`. The text is
 * matched across text nodes, so a sentence with bold or a link in it is found; whitespace runs on the page count
 * as one space. A sentence that is not found clears the mark rather than leave the last one lit.
 */
export function highlightSentence(root: HTMLElement | null, shown: string): void {
  const found = api();
  if (!found || !root) return;
  const target = shown.replace(/\s+/g, " ").trim();

  let text = "";
  const at: Array<{ node: Text; offset: number }> = [];
  let afterSpace = true;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const data = node.data;
    for (let i = 0; i < data.length; i++) {
      const space = /\s/.test(data[i]);
      if (space && afterSpace) continue;
      text += space ? " " : data[i];
      at.push({ node, offset: i });
      afterSpace = space;
    }
  }

  const start = target ? text.indexOf(target) : -1;
  if (start === -1) {
    found.registry.delete(NAME);
    return;
  }
  const first = at[start];
  const last = at[start + target.length - 1];
  const range = document.createRange();
  range.setStart(first.node, first.offset);
  range.setEnd(last.node, last.offset + 1);
  found.registry.set(NAME, new found.Highlight(range));
}

/** Removes the mark (speech stopped or finished). */
export function clearHighlight(): void {
  api()?.registry.delete(NAME);
}
