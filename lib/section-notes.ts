import type { Section } from "@/lib/article-sections";

// ---------------------------------------------------------------------------
// Section notes: one plain sentence per article section, drafted at build
// time so Jev can judge a section by what it covers, not by its (often
// punning) heading. Unlike summaries, they are not review-gated. Merging is
// conservative: a note, once written (by the model or by me), is never
// overwritten; notes for sections that no longer exist are dropped.
// Pure: no I/O, so the build script and tests share it.
// ---------------------------------------------------------------------------

const hasNote = (note: string | undefined): note is string => typeof note === "string" && note.trim() !== "";

/** Keys of the sections (in article order) that have no non-blank note. */
export function missingSectionKeys(sections: Section[], notes?: Record<string, string>): string[] {
  return sections.filter((s) => !hasNote(notes?.[s.key])).map((s) => s.key);
}

/** Existing notes win; drafted notes fill the gaps; only `keys` survive, in their order. */
export function mergeSectionNotes(
  existing: Record<string, string> | undefined,
  drafted: Record<string, string>,
  keys: string[]
): Record<string, string> {
  const merged: Record<string, string> = {};
  for (const key of keys) {
    const kept = existing?.[key];
    if (hasNote(kept)) merged[key] = kept;
    else if (hasNote(drafted[key])) merged[key] = drafted[key].trim();
  }
  return merged;
}
