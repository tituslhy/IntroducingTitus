import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { Recording, ReplaySpan, ReplayStep } from "@/lib/colophon-trace";
import { REPLAY_QUESTIONS } from "@/lib/colophon-trace";
import { createCopilotTools, type CopilotTool } from "@/lib/copilot-tools";

export const COLOPHON_TRACES_PATH = join(process.cwd(), "content", "colophon-traces.json");

const KINDS = new Set(["chain", "llm", "tool", "jev"]);
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const obj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function validSpan(s: unknown): s is ReplaySpan {
  if (!obj(s)) return false;
  return (
    Number.isInteger(s.id) &&
    (s.parent === null || Number.isInteger(s.parent)) &&
    typeof s.name === "string" &&
    KINDS.has(s.kind as string) &&
    num(s.start) &&
    num(s.end) &&
    (s.end as number) >= (s.start as number) &&
    obj(s.inputs) &&
    obj(s.outputs)
  );
}

function validRecording(r: unknown): r is Recording {
  if (!obj(r)) return false;
  const { id, question, recordedAt, models, totalMs, spans, answer, actions, sources } = r;
  return (
    (id === "search" || id === "broad") &&
    typeof question === "string" &&
    typeof recordedAt === "string" &&
    !Number.isNaN(Date.parse(recordedAt)) &&
    obj(models) &&
    typeof models.gpt === "string" &&
    typeof models.jev === "string" &&
    num(totalMs) &&
    Array.isArray(spans) &&
    spans.length > 1 &&
    spans.every(validSpan) &&
    (spans[0] as ReplaySpan).parent === null &&
    typeof answer === "string" &&
    answer.length > 0 &&
    Array.isArray(actions) &&
    actions.every((a) => typeof a === "string") &&
    Array.isArray(sources) &&
    sources.every((s) => obj(s) && Number.isInteger(s.n) && typeof s.title === "string" && typeof s.url === "string")
  );
}

/**
 * The recorded replies for the colophon's Try it panel, in the order the panel offers
 * them; null when the file is missing or malformed, so the panel hides (as the scorecard does).
 * Only a file written by `npm run colophon:record` counts.
 */
export function loadColophonTraces(path: string = COLOPHON_TRACES_PATH): Recording[] | null {
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
  if (!obj(raw) || !Array.isArray(raw.recordings)) return null;
  const recs = raw.recordings.filter(validRecording);
  if (recs.length === 0) return null;
  const order = REPLAY_QUESTIONS.map((q) => q.id);
  return [...recs].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
}

/** Slug → title for every article slug the recordings mention (Jev steps name articles by slug). */
export function titlesFor(recordings: Recording[], articles: readonly { slug: string; title: string }[]): Record<string, string> {
  const wanted = new Set<string>();
  const add = (v: unknown) => typeof v === "string" && wanted.add(v);
  for (const r of recordings)
    for (const s of r.spans) {
      add(s.inputs.slug);
      for (const list of [s.inputs.shortlist, s.outputs.shortlist, s.outputs.nearMisses, s.outputs.ranked])
        if (Array.isArray(list)) for (const x of list) add(obj(x) ? x.slug : x);
    }
  return Object.fromEntries(articles.filter((a) => wanted.has(a.slug)).map((a) => [a.slug, a.title]));
}


/**
 * The progress steps of each recording, worded by the same `describe` the live drawer uses (lib/copilot-tools.ts),
 * from the arguments the model really sent. Calls that show no step live (show_on_page) are left out.
 */
export function stepsFor(recordings: Recording[], tools: CopilotTool[] = createCopilotTools()): Record<string, ReplayStep[]> {
  const byName = new Map(tools.map((t) => [t.definition.name, t]));
  const out: Record<string, ReplayStep[]> = {};
  for (const r of recordings) {
    out[r.id] = r.spans
      .filter((s) => s.kind === "tool")
      .sort((a, b) => a.start - b.start)
      .flatMap((s) => {
        const tool = byName.get(s.name);
        const args = tool?.parse(JSON.stringify(s.inputs)) ?? null;
        if (!tool?.describe || args === null) return [];
        let labels: ReturnType<NonNullable<CopilotTool["describe"]>> = null;
        try {
          labels = tool.describe(args);
        } catch {
          return [];
        }
        return labels ? [{ id: String(s.id), tool: s.name, doing: labels.doing, done: labels.done, start: s.start, end: s.end }] : [];
      });
  }
  return out;
}
