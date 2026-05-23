/**
 * Fixed-window in-memory rate limit for auth endpoints (register, resend, forgot).
 * Single-instance only — same caveats as `stream-rate-limit.ts`.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** Clears counters (Vitest isolation). */
export function clearAuthRateLimitBuckets(): void {
  buckets.clear();
}

function sweepExpired(now: number): void {
  if (buckets.size < 20_000) return;
  for (const [k, v] of buckets) {
    if (v.resetAt <= now) buckets.delete(k);
  }
}

export type AuthRateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

function limitKey(route: string, ip: string): string {
  return `${route}:${ip}`;
}

export type AuthRateLimitOverrides = {
  windowMs?: number;
  maxRequests?: number;
};

/** Per-IP window for a named route (e.g. `register`). Override per route when needed. */
export function limitAuthRoute(
  route: string,
  ip: string,
  overrides?: AuthRateLimitOverrides,
  nowMs: number = Date.now()
): AuthRateLimitResult {
  if (process.env.AUTH_RATE_LIMIT_DISABLED === "1") {
    return { ok: true };
  }

  const windowMs = Math.max(
    1000,
    overrides?.windowMs ??
      (Number.parseInt(process.env.AUTH_RATE_WINDOW_MS || "900000", 10) ||
        900_000)
  );
  const maxRequests = Math.max(
    1,
    overrides?.maxRequests ??
      (Number.parseInt(process.env.AUTH_RATE_MAX_PER_WINDOW || "8", 10) || 8)
  );

  sweepExpired(nowMs);

  const key = limitKey(route, ip);
  let b = buckets.get(key);
  if (!b || b.resetAt <= nowMs) {
    b = { count: 0, resetAt: nowMs + windowMs };
    buckets.set(key, b);
  }

  if (b.count >= maxRequests) {
    const retryAfterSec = Math.max(1, Math.ceil((b.resetAt - nowMs) / 1000));
    return { ok: false, retryAfterSec };
  }

  b.count += 1;
  return { ok: true };
}
