import { NextRequest } from "next/server";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";
import { buildSystemPrompt } from "@/lib/copilot-prompt";
import { PAGE_TARGET_IDS } from "@/lib/profile";
import { MAX_JD_CHARS, MIN_JD_CHARS, fitBriefSchema, sanitizeFitBrief } from "@/lib/fit-brief";
import { checkOrigin, createRateLimiter, getClientIp, jsonError } from "@/lib/api-guards";

// ---------------------------------------------------------------------------
// Recruiter mode: POST { jobDescription } → { brief: FitBrief }
//
// One structured-output call, not streamed: the brief is only useful whole,
// and strict JSON lets the server validate every claim before it's shown.
// ---------------------------------------------------------------------------

const MODEL = "gpt-6-luna";

const MAX_REQUEST_BODY_BYTES = 40_000;
const OPENAI_TIMEOUT_MS = 45_000;

// A brief costs several chat turns' worth of tokens, so it gets its own,
// tighter budget: a handful per visitor per ten minutes.
const checkRateLimit = createRateLimiter(10 * 60_000, 5);

const PAGE_TARGET_SET = new Set<string>(PAGE_TARGET_IDS);
const SCHEMA = fitBriefSchema(PAGE_TARGET_IDS);

let fitPromptCache: string | null = null;

function getFitPrompt(): string {
  if (fitPromptCache && process.env.NODE_ENV === "production") return fitPromptCache;
  const template = readFileSync(join(process.cwd(), "copilot-fit-prompt.md"), "utf-8");
  fitPromptCache = buildSystemPrompt(template);
  return fitPromptCache;
}

/** Keeps a pasted closing tag from breaking out of the data block. */
function wrapJobDescription(jd: string): string {
  const safe = jd.replace(/<\/?job_description>/gi, "");
  return `<job_description>\n${safe}\n</job_description>`;
}

function errorCode(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) return "ERR_RATE_LIMIT";
    if (error.status === 402) return "ERR_QUOTA";
    if (error.status === 401) return "ERR_AUTH";
  }
  return "ERR_UNKNOWN";
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const ip = getClientIp(request);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return jsonError(503, { error: "unavailable" });
  }

  if (!checkOrigin(request)) {
    console.warn(JSON.stringify({ event: "fit_rejected", reason: "origin_mismatch", ip }));
    return jsonError(403, { error: "origin_forbidden" });
  }

  const rateLimit = checkRateLimit(ip);
  if (rateLimit.limited) {
    console.warn(JSON.stringify({ event: "fit_rejected", reason: "rate_limited", ip }));
    return jsonError(429, { error: "rate_limited", retryAfterSeconds: rateLimit.retryAfterSeconds });
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_REQUEST_BODY_BYTES) {
    return jsonError(400, { error: "request_too_large" });
  }

  let jobDescription: unknown;
  try {
    ({ jobDescription } = await request.json());
  } catch {
    return jsonError(400, { error: "invalid_body" });
  }
  if (typeof jobDescription !== "string") {
    return jsonError(400, { error: "invalid_body" });
  }
  const jd = jobDescription.trim();
  if (jd.length < MIN_JD_CHARS) return jsonError(400, { error: "job_description_too_short" });
  if (jd.length > MAX_JD_CHARS) return jsonError(400, { error: "job_description_too_long" });

  const openai = new OpenAI({ apiKey });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const response = await openai.responses.create(
      {
        model: MODEL,
        // Job descriptions can be confidential: don't retain them upstream.
        store: false,
        input: [
          { role: "system", content: getFitPrompt() },
          { role: "user", content: wrapJobDescription(jd) },
        ],
        text: {
          format: { type: "json_schema", name: "fit_brief", strict: true, schema: SCHEMA },
        },
      },
      { signal: controller.signal }
    );

    let raw: unknown = null;
    try {
      raw = JSON.parse(response.output_text);
    } catch {
      // fall through to the null check below
    }
    const brief = sanitizeFitBrief(raw, PAGE_TARGET_SET);
    if (!brief) {
      console.error(JSON.stringify({ event: "fit_error", reason: "unusable_brief" }));
      return jsonError(502, { error: "ERR_UNKNOWN" });
    }

    console.log(
      JSON.stringify({
        event: "fit_request",
        latencyMs: Date.now() - startedAt,
        jdChars: jd.length,
        requirements: brief.requirements.length,
        evidenced: brief.requirements.filter((r) => r.fit !== "not_on_file").length,
      })
    );
    return Response.json({ brief });
  } catch (err) {
    const timedOut = controller.signal.aborted;
    console.error(
      JSON.stringify({
        event: "fit_error",
        reason: timedOut ? "timeout" : "upstream",
        message: err instanceof Error ? err.message : String(err),
      })
    );
    return jsonError(timedOut ? 504 : 502, { error: timedOut ? "ERR_TIMEOUT" : errorCode(err) });
  } finally {
    clearTimeout(timer);
  }
}
