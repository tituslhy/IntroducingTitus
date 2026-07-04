import { NextRequest } from "next/server";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";
import { createHash } from "crypto";
import { Client as LangSmithClient, RunTree } from "langsmith";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const MAX_MESSAGES = 20;
const MAX_CONTENT_LENGTH = 4000;
// Bounds the total conversation payload sent to OpenAI. The per-message and
// per-conversation caps above only bound the worst case to 80,000 chars —
// this cumulative budget is enforced on top of them, before the OpenAI call.
const MAX_TOTAL_CONTENT_LENGTH = 12_000;
// Cheap pre-parse guard against absurdly large request bodies. This is a
// heuristic (Content-Length can be absent/inaccurate for chunked bodies) —
// the real limits are the per-message/cumulative checks below.
const MAX_REQUEST_BODY_BYTES = 100_000;
// Caps total streamed output so a single runaway response can't hold the
// connection open or balloon cost.
const MAX_OUTPUT_CHARS = 6_000;
// Bounds how long we'll wait on the upstream OpenAI call (including the
// full duration of streaming), so a hung request can't hold the connection
// open indefinitely.
const OPENAI_TIMEOUT_MS = 30_000;

// In-process sliding-window rate limit, keyed by client IP. This app runs on
// Vercel Fluid Compute, which reuses instances across requests, so an
// in-memory Map is a reasonable first layer of defense. It is NOT a
// substitute for infra-level protection — a Vercel Firewall rate-limit rule
// should be layered on top of this in production; that's out of scope for
// this code change.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 10;

// Rough, approximate cost estimate for structured logging only. Update these
// per-1K-char rates if OpenAI's published pricing for gpt-5.4-nano changes;
// this is intentionally not token-exact.
const ESTIMATED_INPUT_COST_PER_1K_CHARS = 0.000025;
const ESTIMATED_OUTPUT_COST_PER_1K_CHARS = 0.0001;

const SITE_ORIGINS = new Set<string>([
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://introducing-titus.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001",
]);
if (process.env.VERCEL_URL) {
  SITE_ORIGINS.add(`https://${process.env.VERCEL_URL}`);
}

let systemPromptCache: string | null = null;
let requestCounter = 0;

function getSystemPrompt(): string {
  if (process.env.NODE_ENV !== "production") {
    return readFileSync(join(process.cwd(), "copilot-system-prompt.md"), "utf-8");
  }
  if (!systemPromptCache) {
    systemPromptCache = readFileSync(
      join(process.cwd(), "copilot-system-prompt.md"),
      "utf-8"
    );
  }
  return systemPromptCache;
}

type InputMessage = { role: "system" | "user" | "assistant"; content: string };

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const rateLimitBuckets = new Map<string, number[]>();

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown";
}

function checkRateLimit(ip: string): { limited: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitBuckets.get(ip) ?? []).filter((t) => t > windowStart);

  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitBuckets.set(ip, timestamps);
    const oldest = timestamps[0];
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000)
    );
    return { limited: true, retryAfterSeconds };
  }

  timestamps.push(now);
  if (timestamps.length === 0) {
    rateLimitBuckets.delete(ip);
  } else {
    rateLimitBuckets.set(ip, timestamps);
  }
  return { limited: false, retryAfterSeconds: 0 };
}

// ---------------------------------------------------------------------------
// Origin validation (defense-in-depth, not a sole control — non-browser
// clients can omit or forge the Origin/Referer headers entirely)
// ---------------------------------------------------------------------------

function isAllowedOrigin(originOrReferer: string, request: NextRequest): boolean {
  try {
    const origin = new URL(originOrReferer).origin;
    if (SITE_ORIGINS.has(origin)) return true;
    // Also allow same-origin as the deployment serving the request, so
    // Vercel preview deployments (dynamic *.vercel.app URLs) work without
    // extra config.
    const selfOrigin = new URL(request.url).origin;
    return origin === selfOrigin;
  } catch {
    return false;
  }
}

function checkOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (origin) {
    return isAllowedOrigin(origin, request);
  }
  const referer = request.headers.get("referer");
  if (referer) {
    return isAllowedOrigin(referer, request);
  }
  // No Origin or Referer at all — allow through. This check only guards
  // against forged/cross-site *browser* requests; a non-browser client can
  // simply omit these headers, so absence alone is not a rejection reason.
  return true;
}

// ---------------------------------------------------------------------------
// LangSmith tracing — opt-in only, default OFF, never allowed to break chat
// ---------------------------------------------------------------------------

function isTracingEnabled(): boolean {
  return process.env.COPILOT_TRACING_ENABLED === "true";
}

let lsClientSingleton: LangSmithClient | null = null;

function getLangSmithClient(): LangSmithClient | null {
  if (lsClientSingleton) return lsClientSingleton;
  try {
    lsClientSingleton = new LangSmithClient({ manualFlushMode: true });
    return lsClientSingleton;
  } catch (err) {
    console.warn(
      "copilot tracing: failed to initialize LangSmith client:",
      err instanceof Error ? err.message : String(err)
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// OpenAI streaming
// ---------------------------------------------------------------------------

async function* rawCopilotStream(
  openai: OpenAI,
  input: InputMessage[],
  signal: AbortSignal
) {
  const stream = await openai.responses.create(
    {
      model: "gpt-5.4-nano",
      tools: [{ type: "web_search_preview" }],
      stream: true,
      input,
    },
    { signal }
  );
  for await (const event of stream) {
    if (event.type === "response.output_text.delta") {
      yield event.delta;
    }
  }
}

function createTimeoutController(ms: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    controller,
    clear: () => clearTimeout(timer),
  };
}

function errorCode(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) return "ERR_RATE_LIMIT";
    if (error.status === 402) return "ERR_QUOTA";
    if (error.status === 401) return "ERR_AUTH";
  }
  return "ERR_UNKNOWN";
}

// Newline-delimited JSON framing: each line is a complete JSON object, so the
// client can buffer on "\n" and never has to guess whether a marker like an
// error sentinel arrived intact — unlike a bare-text sentinel, which network
// chunking can split across two `reader.read()` calls.
type StreamEvent = { type: "delta"; text: string } | { type: "error"; code: string };

function encodeEvent(encoder: TextEncoder, event: StreamEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + "\n");
}

function jsonError(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const ip = getClientIp(request);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("Service unavailable", { status: 503 });
  }

  if (!checkOrigin(request)) {
    console.warn(
      JSON.stringify({ event: "copilot_chat_rejected", reason: "origin_mismatch", ip })
    );
    return jsonError(403, { error: "origin_forbidden" });
  }

  const rateLimit = checkRateLimit(ip);
  if (rateLimit.limited) {
    console.warn(
      JSON.stringify({ event: "copilot_chat_rejected", reason: "rate_limited", ip })
    );
    return jsonError(429, {
      error: "rate_limited",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    });
  }

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader && Number(contentLengthHeader) > MAX_REQUEST_BODY_BYTES) {
    console.warn(
      JSON.stringify({ event: "copilot_chat_rejected", reason: "body_too_large", ip })
    );
    return jsonError(400, { error: "request_too_large" });
  }

  let messages: { role: string; content: string }[];
  try {
    ({ messages } = await request.json());
  } catch {
    return new Response("Invalid request body", { status: 400 });
  }

  const VALID_ROLES = new Set(["user", "assistant"]);

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Messages array is required", { status: 400 });
  }

  for (const m of messages) {
    if (!VALID_ROLES.has(m.role)) {
      return new Response("Invalid message role", { status: 400 });
    }
    if (typeof m.content !== "string") {
      return new Response("Message content must be a string", { status: 400 });
    }
    if (m.content.length > MAX_CONTENT_LENGTH) {
      return new Response("Message content too long", { status: 400 });
    }
  }

  const trimmedMessages = messages.slice(-MAX_MESSAGES);

  const totalContentLength = trimmedMessages.reduce((sum, m) => sum + m.content.length, 0);
  if (totalContentLength > MAX_TOTAL_CONTENT_LENGTH) {
    console.warn(
      JSON.stringify({ event: "copilot_chat_rejected", reason: "budget_exceeded", ip })
    );
    return jsonError(400, { error: "conversation_too_long" });
  }

  const openai = new OpenAI({ apiKey });

  const systemPrompt = getSystemPrompt();
  const input: InputMessage[] = [
    { role: "system", content: systemPrompt },
    ...trimmedMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ];

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(streamController) {
      let contentStreamed = false;
      let totalOutputChars = 0;
      const responseChunks: string[] = [];

      const drain = async (
        gen: AsyncIterable<string>,
        abortController: AbortController,
        collect = false
      ) => {
        for await (const chunk of gen) {
          if (totalOutputChars >= MAX_OUTPUT_CHARS) {
            abortController.abort();
            break;
          }
          const remaining = MAX_OUTPUT_CHARS - totalOutputChars;
          const toSend = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
          streamController.enqueue(encodeEvent(encoder, { type: "delta", text: toSend }));
          totalOutputChars += toSend.length;
          if (collect) responseChunks.push(toSend);
          contentStreamed = true;
          if (totalOutputChars >= MAX_OUTPUT_CHARS) {
            abortController.abort();
            break;
          }
        }
      };

      // Tracing is opt-in and fully isolated from the chat response: any
      // failure here (init, postRun, patchRun, flush) is caught and never
      // allowed to affect what the visitor sees.
      let rt: RunTree | null = null;
      if (isTracingEnabled()) {
        try {
          const client = getLangSmithClient();
          if (client) {
            rt = new RunTree({
              name: "copilot-chat",
              run_type: "chain",
              inputs: {
                messageCount: input.length,
                messageLengths: input.map((m) => m.content.length),
                // Traceability without storing raw visitor/system text.
                contentHash: createHash("sha256")
                  .update(input.map((m) => m.content).join("\n"))
                  .digest("hex"),
              },
              client,
            });
            await rt.postRun();
          }
        } catch (err) {
          console.warn(
            "copilot tracing: postRun failed:",
            err instanceof Error ? err.message : String(err)
          );
          rt = null;
        }
      }

      const initialAttempt = createTimeoutController(OPENAI_TIMEOUT_MS);
      try {
        await drain(
          rawCopilotStream(openai, input, initialAttempt.controller.signal),
          initialAttempt.controller,
          true
        );
        if (rt) {
          try {
            rt.end({ outputs: { responseLength: responseChunks.join("").length } });
          } catch {
            // tracing failure must never affect the response
          }
        }
      } catch (err) {
        if (rt) {
          try {
            rt.end({ error: String(err) });
          } catch {
            // tracing failure must never affect the response
          }
        }
        if (err instanceof OpenAI.APIError) {
          console.error(
            JSON.stringify({ event: "copilot_chat_error", status: err.status, message: err.message })
          );
          streamController.enqueue(encodeEvent(encoder, { type: "error", code: errorCode(err) }));
        } else if (!contentStreamed) {
          console.error(
            JSON.stringify({
              event: "copilot_chat_error",
              message: err instanceof Error ? err.message : String(err),
            })
          );
          const retryAttempt = createTimeoutController(OPENAI_TIMEOUT_MS);
          try {
            await drain(
              rawCopilotStream(openai, input, retryAttempt.controller.signal),
              retryAttempt.controller
            );
          } catch (retryErr) {
            console.error(
              JSON.stringify({
                event: "copilot_chat_error",
                message: retryErr instanceof Error ? retryErr.message : String(retryErr),
              })
            );
            streamController.enqueue(encodeEvent(encoder, { type: "error", code: errorCode(retryErr) }));
          } finally {
            retryAttempt.clear();
          }
        }
      } finally {
        initialAttempt.clear();
        if (rt) {
          try {
            await rt.patchRun();
            await getLangSmithClient()?.flush();
          } catch {
            // LangSmith failure must not affect the response
          }
        }

        const latencyMs = Date.now() - startedAt;
        const estimatedCostUsd =
          (systemPrompt.length / 1000) * ESTIMATED_INPUT_COST_PER_1K_CHARS +
          (totalContentLength / 1000) * ESTIMATED_INPUT_COST_PER_1K_CHARS +
          (totalOutputChars / 1000) * ESTIMATED_OUTPUT_COST_PER_1K_CHARS;

        console.log(
          JSON.stringify({
            event: "copilot_chat_request",
            requestCount: ++requestCounter,
            latencyMs,
            estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
            inputChars: totalContentLength,
            outputChars: totalOutputChars,
          })
        );

        streamController.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
