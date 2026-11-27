import { NextRequest } from "next/server";
import OpenAI from "openai";
import { checkOrigin, createRateLimiter, getClientIp, jsonError } from "@/lib/api-guards";
import { transcriptionPrompt } from "@/lib/transcribe-prompt";
import { MAX_CLIP_BYTES, MAX_TRANSCRIPT_CHARS, MIN_CLIP_BYTES, audioExtension } from "@/lib/voice-input";

// ---------------------------------------------------------------------------
// Voice in: POST multipart { audio } → { text }
//
// The drawer records a clip of at most a minute and sends it here; the words
// come back and go in the input box, to be checked before sending. The audio
// is passed straight to OpenAI and dropped: I never store, log or trace it,
// nor the words. The log line keeps the clip's size, format and timing, how
// many characters came back, and the IP (for the rate limit), like chat's.
//
// Transcription is billed by the minute, and the minute's limit lives in the
// browser: a script could send a long clip at a very low bitrate. The byte cap
// (a minute at the browser's bitrate fits easily) and the hourly and daily
// budgets below bound what that can cost.
// ---------------------------------------------------------------------------

const MODEL = "gpt-transcribe";
const OPENAI_TIMEOUT_MS = 30_000;
// Multipart framing around the clip.
const MAX_REQUEST_BODY_BYTES = MAX_CLIP_BYTES + 64_000;

// Tighter than chat's 10 a minute: each clip is a paid call, and five a minute is plenty to talk with.
const checkRateLimit = createRateLimiter(60_000, 5);
// Per visitor per hour, and for everyone per day (per server instance, like the other limits here).
const checkHourly = createRateLimiter(60 * 60_000, 30);
const DAILY_CLIPS = 300;
const checkDaily = createRateLimiter(24 * 60 * 60_000, DAILY_CLIPS);

let promptCache: string | null = null;
function getPrompt(): string {
  if (!promptCache || process.env.NODE_ENV !== "production") promptCache = transcriptionPrompt();
  return promptCache;
}

/**
 * The request body, read up to `max` bytes, or null past that. A browser always says how big its upload is, and a
 * declared size over the limit is refused before this; but a proxy may pass a body on without its length, so the
 * cap is also enforced while reading, never after.
 */
async function readCapped(request: Request, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const body = new Uint8Array(new ArrayBuffer(total));
  let at = 0;
  for (const chunk of chunks) {
    body.set(chunk, at);
    at += chunk.byteLength;
  }
  return body;
}

function errorCode(error: unknown, why: { left: boolean; timedOut: boolean }): string {
  // An aborted call throws the SDK's own error (no status, not named AbortError): say which abort it was.
  if (why.left) return "ERR_CLIENT_LEFT";
  if (why.timedOut) return "ERR_TIMEOUT";
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) return "ERR_RATE_LIMIT";
    if (error.status === 402) return "ERR_QUOTA";
    if (error.status === 401) return "ERR_AUTH";
    if (error.status === 400) return "ERR_BAD_AUDIO";
  }
  return "ERR_UNKNOWN";
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const ip = getClientIp(request);
  const reject = (status: number, reason: string, extra: Record<string, unknown> = {}) => {
    console.warn(JSON.stringify({ event: "copilot_transcribe_rejected", reason, ip }));
    return jsonError(status, { error: reason, ...extra });
  };

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return jsonError(503, { error: "unavailable" });

  if (!checkOrigin(request)) return reject(403, "origin_forbidden");

  // A declared size over the cap is refused before anything else, so it spends no budget.
  const declared = Number(request.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) return reject(413, "clip_too_large");

  // Then the limits, before reading the body, so a visitor over them can't make the server read uploads. One at a
  // time, so a clip refused by a shorter limit spends nothing from the longer ones.
  for (const check of [() => checkRateLimit(ip), () => checkHourly(ip), () => checkDaily("everyone")]) {
    const limit = check();
    if (limit.limited) return reject(429, "rate_limited", { retryAfterSeconds: limit.retryAfterSeconds });
  }

  // A body without a declared size is capped while it's read. The upload can end early (the visitor closed the
  // drawer, the network dropped): that's not a server error.
  let body: Uint8Array<ArrayBuffer> | null;
  try {
    body = await readCapped(request, MAX_REQUEST_BODY_BYTES);
  } catch {
    return reject(499, "client_left");
  }
  if (!body) return reject(413, "clip_too_large");

  let clip: Blob;
  try {
    const form = await new Response(body, {
      headers: { "content-type": request.headers.get("content-type") ?? "" },
    }).formData();
    const value = form.get("audio");
    if (!(value instanceof Blob)) return reject(400, "audio_required");
    clip = value;
  } catch {
    return reject(400, "invalid_body");
  }

  if (clip.size > MAX_CLIP_BYTES) return reject(413, "clip_too_large");
  if (clip.size < MIN_CLIP_BYTES) return reject(422, "clip_empty");
  const ext = audioExtension(clip.type);
  if (!ext) return reject(415, "unsupported_type");

  // The visitor already gone (the drawer closed while the clip uploaded): no paid call at all.
  if (request.signal?.aborted) return reject(499, "client_left");
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, OPENAI_TIMEOUT_MS);
  // The visitor leaving (the drawer closed mid-transcription) stops the paid call too.
  const onLeave = () => controller.abort();
  request.signal?.addEventListener("abort", onLeave);
  try {
    const openai = new OpenAI({ apiKey });
    // OpenAI reads the format from the file name.
    const file = new File([await clip.arrayBuffer()], `clip.${ext}`, { type: clip.type });
    const result = await openai.audio.transcriptions.create(
      // English, like the site: it helps with a clip of a word or two.
      { file, model: MODEL, prompt: getPrompt(), language: "en", response_format: "json" },
      { signal: controller.signal }
    );
    const text = (result.text ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TRANSCRIPT_CHARS);
    console.log(
      JSON.stringify({ event: "copilot_transcribe", ip, bytes: clip.size, type: ext, chars: text.length, ms: Date.now() - startedAt })
    );
    if (!text) return jsonError(422, { error: "nothing_heard" });
    return Response.json({ text });
  } catch (error) {
    const code = errorCode(error, { left: !!request.signal?.aborted, timedOut });
    console.error(JSON.stringify({ event: "copilot_transcribe_failed", ip, code, bytes: clip.size, ms: Date.now() - startedAt }));
    // 502 whatever OpenAI said: a 429 here is my account's limit, not the visitor's, so it isn't passed on as theirs.
    return jsonError(502, { error: code });
  } finally {
    clearTimeout(timer);
    request.signal?.removeEventListener("abort", onLeave);
  }
}
