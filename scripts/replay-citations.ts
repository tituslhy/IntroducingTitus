/**
 * Scenario replays: scripted visitor conversations run through the real agent
 * loop (real GPT, real Jev, no mocks) the way the drawer would send them: last
 * 20 messages as history, plus the citation ledger from every reply so far.
 * Each scenario (scripts/replay-scenarios/) then checks the transcript.
 *
 *   npm run eval:replay                 # every scenario
 *   npm run eval:replay -- mixed-modes  # one scenario
 *   npm run eval:replay -- --list       # list scenarios (no API calls)
 *
 * Costs ~6–11 agent turns per scenario. Writes nothing: /colophon's scorecard
 * is eval:writing's job. Exit code 1 if any check fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { buildSystemPrompt } from "../lib/copilot-prompt";
import { copilotStream } from "../lib/copilot-loop";
import { createCopilotTools, type CopilotTool } from "../lib/copilot-tools";
import { collectCitations, type Source } from "../lib/citations";
import { parseCitations, renderConversationContext, resolveCitations } from "../lib/citation-ledger";
import { SCENARIOS } from "./replay-scenarios";
import { conversationChecks, type ReplayTurn, type Scenario } from "./replay-scenarios/types";

const TURN_TIMEOUT_MS = 90_000;

async function runTurn(openai: OpenAI, systemPrompt: string, messages: ReplayTurn[]): Promise<ReplayTurn> {
  const history = messages.slice(-20).map(({ role, content }) => ({ role, content }));
  const prior = resolveCitations(parseCitations(collectCitations(messages)) ?? []);
  const input = [
    { role: "system" as const, content: systemPrompt },
    { role: "system" as const, content: renderConversationContext(prior, new Date()) },
    ...history,
  ];
  // Log each tool the agent calls this turn, in call order.
  const called: string[] = [];
  const tools: CopilotTool[] = createCopilotTools({ prior }).map((t) => ({
    ...t,
    run: (args, ctx) => (called.push(t.definition.name), t.run(args, ctx)),
  }));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TURN_TIMEOUT_MS);
  let content = "";
  const sources: Source[] = [];
  try {
    for await (const chunk of copilotStream(openai, input, tools, controller.signal)) {
      if (chunk.kind === "text") content += chunk.text;
      else if (chunk.event.type === "source") {
        const { n, title, url } = chunk.event;
        sources.push({ n, title, url });
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return {
    role: "assistant",
    content,
    tools: called,
    ...(sources.length > 0 && { sources: sources.sort((a, b) => a.n - b.n) }),
  };
}

/** Runs one scenario, prints its transcript and checks; returns the failed check labels. */
async function runScenario(openai: OpenAI, systemPrompt: string, scenario: Scenario): Promise<string[]> {
  console.log(`\n════ ${scenario.name}: ${scenario.description}`);
  const messages: ReplayTurn[] = [];
  for (const [i, question] of scenario.turns.entries()) {
    messages.push({ role: "user", content: question });
    const reply = await runTurn(openai, systemPrompt, messages);
    messages.push(reply);
    console.log(`\n── turn ${i}: ${question}`);
    console.log(`   tools: ${reply.tools?.length ? reply.tools.join(", ") : "none"}`);
    console.log(reply.content);
    for (const s of reply.sources ?? []) console.log(`   [${s.n}] ${s.title}`);
  }

  console.log(`\n── checks (${scenario.name})`);
  const failed: string[] = [];
  for (const { label, ok } of [...conversationChecks(messages), ...scenario.checks(messages)]) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
    if (!ok) failed.push(`${scenario.name}: ${label}`);
  }
  return failed;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--list")) {
    for (const s of SCENARIOS) console.log(`${s.name}\t${s.turns.length} turns\t${s.description}`);
    return;
  }
  const names = args.filter((a) => !a.startsWith("--"));
  const unknown = names.filter((n) => !SCENARIOS.some((s) => s.name === n));
  if (unknown.length) {
    throw new Error(`Unknown scenario(s): ${unknown.join(", ")}. Known: ${SCENARIOS.map((s) => s.name).join(", ")}`);
  }
  const selected = names.length ? SCENARIOS.filter((s) => names.includes(s.name)) : SCENARIOS;

  const openai = new OpenAI();
  const systemPrompt = buildSystemPrompt(readFileSync(join(process.cwd(), "prompts", "copilot-system-prompt.md"), "utf-8"));
  const failures: string[] = [];
  for (const scenario of selected) failures.push(...(await runScenario(openai, systemPrompt, scenario)));

  if (failures.length) {
    console.log(`\n${failures.length} check(s) failed:`);
    for (const f of failures) console.log(`  - ${f}`);
  } else console.log("\nAll checks passed.");
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
