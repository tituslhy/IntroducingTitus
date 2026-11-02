/**
 * Request guards shared by the copilot API routes (/api/chat, /api/fit):
 * client IP, origin check, sliding-window rate limit, JSON errors.
 */
import type { NextRequest } from "next/server";
import { SITE_URL } from "./content";

const SITE_ORIGINS = new Set<string>([
  process.env.NEXT_PUBLIC_SITE_URL ?? SITE_URL,
  "http://localhost:3000",
  "http://localhost:3001",
]);
if (process.env.VERCEL_URL) {
  SITE_ORIGINS.add(`https://${process.env.VERCEL_URL}`);
}

export function getClientIp(request: NextRequest): string {
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

export type RateLimitResult = { limited: boolean; retryAfterSeconds: number };

/**
 * In-process sliding-window rate limit, keyed by client IP. This app runs on
 * Vercel Fluid Compute, which reuses instances across requests, so an
 * in-memory Map is a reasonable first layer of defense. It is NOT a
 * substitute for infra-level protection — a Vercel Firewall rate-limit rule
 * should be layered on top of this in production.
 *
 * Each call creates an independent limiter, so routes with different costs
 * get different budgets.
 */
export function createRateLimiter(windowMs: number, maxRequests: number) {
  const buckets = new Map<string, number[]>();

  return function checkRateLimit(ip: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;
    const timestamps = (buckets.get(ip) ?? []).filter((t) => t > windowStart);

    if (timestamps.length >= maxRequests) {
      buckets.set(ip, timestamps);
      const oldest = timestamps[0];
      const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      return { limited: true, retryAfterSeconds };
    }

    timestamps.push(now);
    buckets.set(ip, timestamps);
    return { limited: false, retryAfterSeconds: 0 };
  };
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

export function checkOrigin(request: NextRequest): boolean {
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

export function jsonError(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
