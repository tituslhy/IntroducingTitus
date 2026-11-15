// ---------------------------------------------------------------------------
// Splits an article's Markdown body into sections, one per heading, so the
// copilot can read the parts of an article that matter instead of its first
// 12,000 characters. Headings are only recognised outside fenced code: most
// of my articles contain Python, where `# comment` is not a heading.
// Pure: no corpus import, so it's safe anywhere (callers pass the body).
// ---------------------------------------------------------------------------

export type Section = {
  /** Stable id within the article: the normalised heading, "(intro)", or "Heading (2)" for a repeat. */
  key: string;
  /** Normalised heading text, or null for the intro (text before the first heading). */
  heading: string | null;
  /** Section text without its heading line, trimmed. */
  body: string;
};

const HEADING = /^#{1,6}\s+(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** "#### _Catching Jev-er_ now" → "Catching Jev-er now". */
export function normalizeHeading(raw: string): string {
  return raw
    .replace(/ /g, " ")
    .replace(/^\s*#{1,6}\s+/, "")
    .replace(/[*`]/g, "")
    .replace(/(^|\s)_+|_+(?=\s|$)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** "(intro)" for the intro; the heading itself; "Heading (2)" and on for repeats. */
export function sectionKey(heading: string | null, occurrence: number): string {
  if (heading === null) return "(intro)";
  return occurrence > 1 ? `${heading} (${occurrence})` : heading;
}

export function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  const seen = new Map<string, number>();
  let heading: string | null = null;
  let lines: string[] = [];
  let fence: string | null = null;

  const flush = () => {
    const text = lines.join("\n").trim();
    lines = [];
    if (heading === null && !text) return; // a blank intro isn't a section
    const occurrence = heading === null ? 1 : (seen.get(heading) ?? 0) + 1;
    if (heading !== null) seen.set(heading, occurrence);
    sections.push({ key: sectionKey(heading, occurrence), heading, body: text });
  };

  for (const line of body.split("\n")) {
    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (fence === null) fence = marker[0].repeat(marker.length);
      else if (marker[0] === fence[0] && marker.length >= fence.length) fence = null;
      lines.push(line);
      continue;
    }
    const headingMatch = fence === null ? line.match(HEADING) : null;
    if (headingMatch) {
      flush();
      heading = normalizeHeading(line);
      continue;
    }
    lines.push(line);
  }
  flush();
  return sections;
}

const memo = new Map<string, { body: string; sections: Section[] }>();

/** splitSections, cached per article slug; a changed body for the same slug is re-split, never served stale. */
export function memoSections(slug: string, body: string): Section[] {
  const hit = memo.get(slug);
  if (hit && hit.body === body) return hit.sections;
  const sections = splitSections(body);
  memo.set(slug, { body, sections });
  return sections;
}
