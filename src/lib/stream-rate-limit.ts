/**
 * Fixed-window in-memory rate limit for `/api/stream` (single Node instance).
 * Not suitable for multi-instance deploys without a shared store — use Redis then.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Clears counters (for Vitest isolation only). */
export function clearStreamRateLimitBuckets(): void {
  buckets.clear();
}

function sweepExpired(now: number): void {
  if (buckets.size < 50_000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export type StreamRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

/** Call once per proxied request after resolving client IP. */
export function limitStreamProxy(
  ip: string,
  nowMs: number = Date.now()
): StreamRateLimitResult {
  if (process.env.STREAM_PROXY_RATE_LIMIT_DISABLED === "1") {
    return { ok: true };
  }

  const windowMs = Math.max(
    1000,
    parseInt(process.env.STREAM_PROXY_RATE_WINDOW_MS || "60000", 10) || 60000
  );
  const maxRequests = Math.max(
    1,
    parseInt(process.env.STREAM_PROXY_RATE_MAX || "4000", 10) || 4000
  );

  sweepExpired(nowMs);

  let b = buckets.get(ip);
  if (!b || b.resetAt <= nowMs) {
    b = { count: 0, resetAt: nowMs + windowMs };
    buckets.set(ip, b);
  }

  if (b.count >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - nowMs) / 1000));
    return { ok: false, retryAfterSec };
  }

  b.count += 1;
  return { ok: true };
}
