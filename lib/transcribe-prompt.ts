import { TOOLS } from "@/lib/about";
import { EDUCATION, PROJECTS, ROLES } from "@/lib/profile";

// ---------------------------------------------------------------------------
// The hint the transcriber gets with every clip: what the recording is about
// and the names that come up, spelled as my site spells them, so "LangGraph"
// doesn't come back as "Lang graph" or "Illumina" as "Illuminate". Built from
// the same data the pages render, so a new tool or role is in it at once.
// ---------------------------------------------------------------------------

/** Names a visitor may say: me, the copilot, my employers, projects, schools and every tool I've used. */
export function transcriptionVocabulary(): string[] {
  // Tools first and my own names last: if a transcriber keeps only the end of a long prompt, these are what stay.
  const names = [
    ...TOOLS.map((t) => t.name),
    ...EDUCATION.flatMap((e) => [e.short, e.institution]),
    ...PROJECTS.map((p) => p.title),
    ...ROLES.flatMap((r) => [r.company, r.short]),
    "MITB",
    "Jev",
    "Ask Titus",
    "Titus",
  ];
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))];
}

/** The prompt sent with each clip (free text, as gpt-transcribe takes it). */
export function transcriptionPrompt(): string {
  return (
    "A visitor speaking to Ask Titus, the copilot on Titus Lim's portfolio site, asking about his AI engineering work, " +
    `projects, writing and experience. Names that may come up: ${transcriptionVocabulary().join(", ")}.`
  );
}
