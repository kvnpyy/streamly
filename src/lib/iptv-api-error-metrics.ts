/**
 * In-process IPTV API error counters for `/api/metrics` and proactive alerts.
 * Resets on deploy/restart — paired with cron samples for trend detection.
 */

export type IptvApiErrorCategory =
  | "missing_credentials"
  | "turnstile_required"
  | "turnstile_failed"
  | "provider_verify_failed"
  | "catalog_upstream_error"
  | "stream_upstream_4xx"
  | "stream_upstream_5xx"
  | "stream_rate_limited";

const CATEGORIES: IptvApiErrorCategory[] = [
  "missing_credentials",
  "turnstile_required",
  "turnstile_failed",
  "provider_verify_failed",
  "catalog_upstream_error",
  "stream_upstream_4xx",
  "stream_upstream_5xx",
  "stream_rate_limited",
];

type MinuteBucket = Partial<Record<IptvApiErrorCategory, number>>;

const buckets = new Map<number, MinuteBucket>();
let lastMinute = Math.floor(Date.now() / 60_000);
const WINDOW_MINUTES = 60;

function pruneBuckets(): void {
  const cutoff = lastMinute - WINDOW_MINUTES;
  for (const key of buckets.keys()) {
    if (key < cutoff) buckets.delete(key);
  }
}

function tickMinute(): void {
  const minute = Math.floor(Date.now() / 60_000);
  while (lastMinute < minute) {
    lastMinute += 1;
    if (!buckets.has(lastMinute)) buckets.set(lastMinute, {});
  }
  pruneBuckets();
}

/** Record a user-impacting API error (call from route handlers). */
export function recordIptvApiError(
  category: IptvApiErrorCategory,
  count = 1
): void {
  if (!Number.isFinite(count) || count <= 0) return;
  tickMinute();
  const bucket = buckets.get(lastMinute) ?? {};
  bucket[category] = (bucket[category] ?? 0) + count;
  buckets.set(lastMinute, bucket);
}

export type IptvApiErrorMetrics = {
  windowMinutes: number;
  totals: Record<IptvApiErrorCategory, number>;
  last15Min: Record<IptvApiErrorCategory, number>;
  last60Min: Record<IptvApiErrorCategory, number>;
};

function sumWindow(minutesBack: number): Record<IptvApiErrorCategory, number> {
  const out = emptyTotals();
  const end = lastMinute;
  const start = end - minutesBack + 1;
  for (const [minute, bucket] of buckets) {
    if (minute < start || minute > end) continue;
    for (const cat of CATEGORIES) {
      out[cat] += bucket[cat] ?? 0;
    }
  }
  return out;
}

function emptyTotals(): Record<IptvApiErrorCategory, number> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<
    IptvApiErrorCategory,
    number
  >;
}

export function getIptvApiErrorMetrics(): IptvApiErrorMetrics {
  tickMinute();
  const last15Min = sumWindow(15);
  const last60Min = sumWindow(60);
  const totals = emptyTotals();
  for (const cat of CATEGORIES) {
    totals[cat] = last60Min[cat];
  }
  return {
    windowMinutes: WINDOW_MINUTES,
    totals,
    last15Min,
    last60Min,
  };
}

/** Vitest isolation */
export function resetIptvApiErrorMetricsForTests(): void {
  buckets.clear();
  lastMinute = Math.floor(Date.now() / 60_000);
}
