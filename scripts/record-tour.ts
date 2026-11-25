/**
 * Records the front page's "Show me around" tour: one real run of Ask Titus, no mocks.
 *
 *   npm run tour:record           # → content/site-tour.json
 *   npm run tour:record -- --dry  # print the tour without writing
 *
 * The copilot gets its normal system prompt plus content/tour-brief.md (the route, the beats, the time limit)
 * and fills a strict schema of steps ({ say, targets }), each target from the same vocabulary as show_on_page.
 * Read the printed tour before committing: if a line is wrong, adjust the brief and record again.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import OpenAI from "openai";
import { buildSystemPrompt } from "../lib/copilot-prompt";
import { MODEL } from "../lib/copilot-loop";
import { parseTour, stepDurationMs, tourDurationMs, tourJsonSchema, tourProblems } from "../lib/site-tour";

const OUT = join(process.cwd(), "content", "site-tour.json");
const TOUR_QUESTION = "Show me around.";

async function main() {
  const dry = process.argv.includes("--dry");
  const openai = new OpenAI();
  const systemPrompt = buildSystemPrompt(readFileSync(join(process.cwd(), "copilot-system-prompt.md"), "utf-8"));
  const brief = readFileSync(join(process.cwd(), "content", "tour-brief.md"), "utf-8");

  const res = await openai.responses.create({
    model: MODEL,
    input: [
      { role: "system", content: systemPrompt },
      { role: "system", content: brief },
      { role: "user", content: TOUR_QUESTION },
    ],
    text: { format: { type: "json_schema", name: "site_tour", schema: tourJsonSchema(), strict: true } },
  });

  const parsed = parseTour(JSON.parse(res.output_text));
  if (!parsed) throw new Error(`The copilot's answer isn't a tour:\n${res.output_text}`);
  const tour = { ...parsed, draft: false, recordedAt: new Date().toISOString(), model: MODEL };

  tour.steps.forEach((s, i) =>
    console.log(`${String(i + 1).padStart(2)}. (${(stepDurationMs(s) / 1000).toFixed(1)}s) ${s.say}\n    → ${s.targets.join(", ") || "—"}`)
  );
  console.log(`Total: ${(tourDurationMs(tour) / 1000).toFixed(0)}s`);

  const problems = tourProblems(tour);
  if (problems.length) {
    console.error(`Not saved; record again:\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
    return;
  }
  if (dry) return;
  writeFileSync(OUT, JSON.stringify(tour, null, 2) + "\n");
  console.log(`Saved ${OUT}. Read it before committing.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
