import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The /colophon scorecard, read from content/eval-results.json (written only
 * by scripts/eval-writing.ts from a real run). Returns null when the file is
 * missing or malformed, and the section is hidden: never a made-up number.
 * Server-only; read at build time, since /colophon is statically rendered.
 */
export type Scorecard = {
  runAt: string;
  questionCount: number;
  jevModel: string | null;
  toolCallAccuracy: number | null;
  stage1Recall: number | null;
  precisionAt2: number | null;
  abstainAccuracy: number | null;
  noInvention: number | null;
};

export const EVAL_RESULTS_PATH = join(process.cwd(), "content", "eval-results.json");

const ratioOrNull = (x: unknown): number | null | undefined =>
  x === null ? null : typeof x === "number" && Number.isFinite(x) && x >= 0 && x <= 1 ? x : undefined;

export function loadScorecard(path: string = EVAL_RESULTS_PATH): Scorecard | null {
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const { runAt, metrics, model } = raw as { runAt?: unknown; metrics?: Record<string, unknown>; model?: { jev?: unknown } };
  if (typeof runAt !== "string" || Number.isNaN(Date.parse(runAt)) || !metrics || typeof metrics !== "object") return null;
  const { questionCount } = metrics;
  if (typeof questionCount !== "number" || !Number.isInteger(questionCount) || questionCount < 1) return null;

  const keys = ["toolCallAccuracy", "stage1Recall", "precisionAt2", "abstainAccuracy", "noInvention"] as const;
  const values = Object.fromEntries(keys.map((k) => [k, ratioOrNull(metrics[k])]));
  if (Object.values(values).some((v) => v === undefined)) return null;

  return {
    runAt,
    questionCount,
    jevModel: typeof model?.jev === "string" ? model.jev : null,
    ...(values as Record<(typeof keys)[number], number | null>),
  };
}
