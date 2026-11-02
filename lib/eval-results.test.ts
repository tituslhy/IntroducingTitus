import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { EVAL_RESULTS_PATH, loadScorecard } from "./eval-results";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "eval-results-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(content: string, name = "eval-results.json"): string {
  const path = join(dir, name);
  writeFileSync(path, content);
  return path;
}

const validFile = {
  runAt: "2026-10-01T09:30:00Z",
  model: { jev: "jev-1.13" },
  metrics: {
    questionCount: 42,
    toolCallAccuracy: 0.9,
    stage1Recall: 0.8,
    precisionAt2: null,
    abstainAccuracy: 1,
    noInvention: 0,
  },
};

const withMetrics = (metrics: Record<string, unknown>) => JSON.stringify({ ...validFile, metrics: { ...validFile.metrics, ...metrics } });

describe("loadScorecard", () => {
  it("points at content/eval-results.json under the project root", () => {
    expect(EVAL_RESULTS_PATH.endsWith(join("content", "eval-results.json"))).toBe(true);
  });

  it("returns null when the file is missing", () => {
    expect(loadScorecard(join(dir, "does-not-exist.json"))).toBeNull();
  });

  it("returns null when the file is not valid JSON", () => {
    expect(loadScorecard(write("{not json"))).toBeNull();
  });

  it("returns null when the JSON is not an object", () => {
    expect(loadScorecard(write("null"))).toBeNull();
    expect(loadScorecard(write('"scorecard"'))).toBeNull();
  });

  it("returns null when runAt is missing, not a string, or not a date", () => {
    expect(loadScorecard(write(JSON.stringify({ ...validFile, runAt: undefined })))).toBeNull();
    expect(loadScorecard(write(JSON.stringify({ ...validFile, runAt: 1727774400 })))).toBeNull();
    expect(loadScorecard(write(JSON.stringify({ ...validFile, runAt: "not a date" })))).toBeNull();
  });

  it("returns null when metrics is missing", () => {
    expect(loadScorecard(write(JSON.stringify({ runAt: validFile.runAt, model: validFile.model })))).toBeNull();
  });

  it.each([
    ["missing", undefined],
    ["a fraction", 1.5],
    ["zero", 0],
    ["negative", -3],
    ["a string", "42"],
  ])("returns null when questionCount is %s", (_label, value) => {
    expect(loadScorecard(write(withMetrics({ questionCount: value })))).toBeNull();
  });

  it.each([
    ["above 1", { toolCallAccuracy: 1.2 }],
    ["below 0", { stage1Recall: -0.1 }],
    ["a numeric string", { precisionAt2: "0.5" }],
    ["a boolean", { abstainAccuracy: true }],
    ["missing", { noInvention: undefined }],
  ])("returns null when a ratio is %s", (_label, override) => {
    expect(loadScorecard(write(withMetrics(override)))).toBeNull();
  });

  it("accepts 0 and 1 as ratios and null as 'not measured'", () => {
    const card = loadScorecard(write(withMetrics({ toolCallAccuracy: 0, stage1Recall: 1, precisionAt2: null })));
    expect(card).toMatchObject({ toolCallAccuracy: 0, stage1Recall: 1, precisionAt2: null });
  });

  it("maps a valid file to a Scorecard, taking jevModel from model.jev", () => {
    expect(loadScorecard(write(JSON.stringify(validFile)))).toEqual({
      runAt: "2026-10-01T09:30:00Z",
      questionCount: 42,
      jevModel: "jev-1.13",
      toolCallAccuracy: 0.9,
      stage1Recall: 0.8,
      precisionAt2: null,
      abstainAccuracy: 1,
      noInvention: 0,
    });
  });

  it("sets jevModel to null when the model is not recorded", () => {
    const card = loadScorecard(write(JSON.stringify({ ...validFile, model: undefined })));
    expect(card?.jevModel).toBeNull();
  });
});
