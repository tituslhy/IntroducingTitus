/**
 * Records the colophon's "Try it" replays: real GPT + real Jev, no mocks.
 *
 *   npm run colophon:record            # both questions → content/colophon-traces.json
 *   npm run colophon:record -- broad   # re-record one (search | broad), keep the other
 *   npm run colophon:record -- --dry   # print the summary without writing
 *
 * Each question runs once through the same loop, tools and system prompt as
 * /api/chat, with a RecordingObserver (lib/colophon-trace.ts) in place of
 * LangSmith. The file keeps no system prompt and no article text. Read the
 * summary before committing: if a run isn't how the copilot normally behaves
 * (say it read only three articles for the broad question), run it again.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { renderConversationContext } from "../lib/citation-ledger";
import { buildSystemPrompt } from "../lib/copilot-prompt";
import { copilotStream, MODEL as GPT_MODEL, type InputMessage } from "../lib/copilot-loop";
import { createCopilotTools } from "../lib/copilot-tools";
import { JEV_MODEL } from "../lib/writing-search";
import {
  REPLAY_QUESTIONS,
  RecordingObserver,
  recordingProblems,
  type ColophonTraces,
  type Recording,
  type ReplaySource,
} from "../lib/colophon-trace";

const OUT = join(process.cwd(), "content", "colophon-traces.json");
const TIMEOUT_MS = 90_000;

async function record(openai: OpenAI, systemPrompt: string, id: Recording["id"], question: string): Promise<Recording> {
  const input: InputMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "system", content: renderConversationContext([], new Date()) },
    { role: "user", content: question },
  ];
  const observer = new RecordingObserver();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let answer = "";
  const actions: string[] = [];
  const sources: ReplaySource[] = [];
  try {
    for await (const chunk of copilotStream(openai, input, createCopilotTools(), controller.signal, undefined, observer)) {
      if (chunk.kind === "text") answer += chunk.text;
      else if (chunk.event.type === "action") {
        if (!actions.includes(chunk.event.target)) actions.push(chunk.event.target);
      }
      else if (chunk.event.type === "source") sources.push({ n: chunk.event.n, title: chunk.event.title, url: chunk.event.url });
    }
  } finally {
    clearTimeout(timer);
  }
  const { spans, totalMs } = observer.finish({ answer, actions, sources: sources.map((s) => s.n) });
  const problems = recordingProblems(spans);
  if (problems.length) throw new Error(`"${question}" recorded badly; run it again:\n  ${problems.join("\n  ")}`);
  const jev = spans.find((s) => s.name.startsWith("jev filter"))?.outputs.model;
  return {
    id,
    question,
    recordedAt: new Date().toISOString(),
    models: { gpt: GPT_MODEL, jev: typeof jev === "string" ? jev : JEV_MODEL },
    totalMs,
    spans,
    answer,
    actions,
    sources,
  };
}

function summary(r: Recording): string {
  const count = (pre: string) => r.spans.filter((s) => s.name.startsWith(pre)).length;
  const reads = r.spans
    .filter((s) => s.name === "read_writing" || s.name === "search_writing")
    .map((s) => `    ${s.name}: ${((s.outputs.articles as { title: string }[] | undefined) ?? []).map((a) => a.title).join(" · ")}`);
  return [
    `\n${r.id}: "${r.question}"  ${(r.totalMs / 1000).toFixed(2)}s, ${r.spans.length} spans`,
    `  gpt rounds ${count("gpt round")} · search_writing ${count("search_writing")} · read_writing ${count("read_writing")} · jev ${count("jev")}`,
    ...reads,
    `  sources ${r.sources.length} · page stops ${r.actions.join(", ") || "none"}`,
    `  answer: ${r.answer.slice(0, 240).replace(/\s+/g, " ")}${r.answer.length > 240 ? "…" : ""}`,
  ].join("\n");
}

async function main() {
  if (!process.env.OPENAI_API_KEY || !process.env.TYPESAFE_API_KEY) {
    throw new Error("OPENAI_API_KEY and TYPESAFE_API_KEY must be set (.env.local).");
  }
  const dry = process.argv.includes("--dry");
  const only = process.argv.slice(2).find((a) => a === "search" || a === "broad");
  const openai = new OpenAI();
  const systemPrompt = buildSystemPrompt(readFileSync(join(process.cwd(), "prompts", "copilot-system-prompt.md"), "utf-8"));

  const existing: ColophonTraces = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf-8")) : { recordings: [] };
  const recordings: Recording[] = [];
  for (const { id, question } of REPLAY_QUESTIONS) {
    const kept = existing.recordings.find((r) => r.id === id);
    if (only && only !== id && kept) {
      recordings.push(kept);
      continue;
    }
    process.stdout.write(`Recording ${id}: ${question}\n`);
    const r = await record(openai, systemPrompt, id, question);
    console.log(summary(r));
    recordings.push(r);
  }
  if (dry) return console.log("\n--dry: nothing written.");
  writeFileSync(OUT, JSON.stringify({ recordings } satisfies ColophonTraces, null, 2) + "\n");
  console.log(`\nWrote ${OUT}. Read the summary above; re-run a question if it isn't typical. Commit only a real run.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
