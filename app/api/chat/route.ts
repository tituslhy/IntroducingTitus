import { NextRequest, after } from "next/server";
import OpenAI from "openai";
import { readFileSync } from "fs";
import { join } from "path";
import { Client as LangSmithClient } from "langsmith";
import { buildSystemPrompt } from "@/lib/copilot-prompt";
import { createCopilotTools, type CopilotEvent } from "@/lib/copilot-tools";
import { copilotStream, type CopilotChunk, type InputMessage, type LoopStats } from "@/lib/copilot-loop";
import { ChatTrace } from "@/lib/copilot-tracing";
import { checkOrigin, createRateLimiter, getClientIp, jsonError } from "@/lib/api-guards";

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
const checkRateLimit = createRateLimiter(RATE_LIMIT_WINDOW_MS, RATE_LIMIT_MAX_REQUESTS);

// Rough, approximate cost estimate for structured logging only. Update these
// per-1K-char rates if OpenAI's published pricing for gpt-6-luna changes;
// this is intentionally not token-exact.
const ESTIMATED_INPUT_COST_PER_1K_CHARS = 0.000025;
const ESTIMATED_OUTPUT_COST_PER_1K_CHARS = 0.0001;

let systemPromptCache: string | null = null;
let requestCounter = 0;

// The markdown file is a template: facts come from lib/profile.ts and
// lib/content.ts (the same data the page renders) via buildSystemPrompt.
function renderSystemPrompt(): string {
  const template = readFileSync(join(process.cwd(), "copilot-system-prompt.md"), "utf-8");
  return buildSystemPrompt(template);
}

function getSystemPrompt(): string {
  if (process.env.NODE_ENV !== "production") {
    return renderSystemPrompt();
  }
  if (!systemPromptCache) {
    systemPromptCache = renderSystemPrompt();
  }
  return systemPromptCache;
}

// Drawer-side cap on distinct page actions, deduped across the initial
// attempt and any retry. show_on_page's own per-reply limit is stricter.
const MAX_ACTIONS_PER_REPLY = 3;

// ---------------------------------------------------------------------------
// LangSmith tracing — ON by default (needs a LangSmith key), never allowed to break chat.
// When on, traces are FULL TEXT (see lib/copilot-tracing.ts). /api/fit is
// never traced: job descriptions can be confidential.
// ---------------------------------------------------------------------------

/**
 * On by default, like os.environ.get("COPILOT_TRACING_ENABLED", "true"): only
 * an explicit false/0/no/off turns it off. Without a LangSmith API key there
 * is nowhere to send traces, so it stays quietly off rather than failing
 * (and warning) on every request.
 */
export function isTracingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const flag = (env.COPILOT_TRACING_ENABLED ?? "true").trim().toLowerCase();
  if (["false", "0", "no", "off"].includes(flag)) return false;
  return Boolean(env.LANGSMITH_API_KEY || env.LANGCHAIN_API_KEY);
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


// Trace uploads happen after the reply has closed, bounded so a slow
// LangSmith can't keep the function alive for long.
const TRACE_UPLOAD_TIMEOUT_MS = 5_000;

/** Runs `task` once the response has finished (Next's after()), never blocking or failing the reply. */
function afterResponse(task: () => Promise<void>): void {
  const bounded = () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cap = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, TRACE_UPLOAD_TIMEOUT_MS);
    });
    return Promise.race([task(), cap])
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  };
  try {
    after(bounded);
  } catch {
    void bounded(); // outside a request scope (tests, scripts): just run it
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
type StreamEvent =
  | { type: "delta"; text: string }
  | CopilotEvent
  | { type: "error"; code: string };

function encodeEvent(encoder: TextEncoder, event: StreamEvent): Uint8Array {
  return encoder.encode(JSON.stringify(event) + "\n");
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
      // Deduped across the initial attempt and any retry.
      const actionsShown = new Set<string>();
      const sourcesSent: { n: number; title: string; url: string }[] = [];
      let traceError: string | undefined;
      const stats: LoopStats = { rounds: 0, toolCalls: 0 };
      // One tool set per request, shared by the attempt and any retry, so source
      // numbers already streamed to the drawer keep pointing at the same articles.
      const tools = createCopilotTools();

      const drain = async (gen: AsyncIterable<CopilotChunk>, abortController: AbortController) => {
        for await (const item of gen) {
          if (item.kind === "event") {
            const { event } = item;
            if (event.type === "action") {
              if (!actionsShown.has(event.target) && actionsShown.size < MAX_ACTIONS_PER_REPLY) {
                actionsShown.add(event.target);
                streamController.enqueue(encodeEvent(encoder, event));
              }
            } else {
              if (event.type === "source") sourcesSent.push({ n: event.n, title: event.title, url: event.url });
              streamController.enqueue(encodeEvent(encoder, event));
            }
            continue;
          }
          const chunk = item.text;
          if (totalOutputChars >= MAX_OUTPUT_CHARS) {
            abortController.abort();
            break;
          }
          const remaining = MAX_OUTPUT_CHARS - totalOutputChars;
          const toSend = chunk.length > remaining ? chunk.slice(0, remaining) : chunk;
          streamController.enqueue(encodeEvent(encoder, { type: "delta", text: toSend }));
          totalOutputChars += toSend.length;
          responseChunks.push(toSend);
          contentStreamed = true;
          if (totalOutputChars >= MAX_OUTPUT_CHARS) {
            abortController.abort();
            break;
          }
        }
      };

      // Tracing is opt-in and fully isolated from the chat response: any
      // failure in it is caught and never allowed to affect what the visitor sees.
      let trace: ChatTrace | null = null;
      if (isTracingEnabled()) {
        const client = getLangSmithClient();
        if (client) {
          try {
            trace = await ChatTrace.start(client, input);
          } catch {
            trace = null; // tracing must never affect the reply
          }
        }
      }

      const initialAttempt = createTimeoutController(OPENAI_TIMEOUT_MS);
      try {
        await drain(
          copilotStream(openai, input, tools, initialAttempt.controller.signal, stats, trace?.observer()),
          initialAttempt.controller
        );
      } catch (err) {
        traceError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
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
              copilotStream(openai, input, tools, retryAttempt.controller.signal, stats, trace?.observer()),
              retryAttempt.controller
            );
            traceError = `${traceError} (recovered on retry)`;
          } catch (retryErr) {
            traceError = `${traceError}; retry: ${retryErr instanceof Error ? `${retryErr.name}: ${retryErr.message}` : String(retryErr)}`;
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
            actionsShown: actionsShown.size,
            rounds: stats.rounds,
            toolCalls: stats.toolCalls,
          })
        );

        streamController.close();

        // The visitor's stream is closed; the trace uploads afterwards.
        if (trace) {
          const finishing = trace;
          const recovered = traceError?.endsWith("(recovered on retry)");
          const outputs = {
            answer: responseChunks.join(""),
            truncated: totalOutputChars >= MAX_OUTPUT_CHARS,
            actionsShown: Array.from(actionsShown),
            sources: sourcesSent,
            rounds: stats.rounds,
            toolCalls: stats.toolCalls,
            ...(recovered && { recoveredError: traceError }),
          };
          const error = recovered ? undefined : traceError;
          afterResponse(async () => {
            await finishing.finish(outputs, error);
            await getLangSmithClient()?.flush();
          });
        }
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
