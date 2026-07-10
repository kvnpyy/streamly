/**
 * In-process Chromecast / AirPlay cast funnel counters for `/api/metrics`.
 * Resets on deploy — use with client `/api/cast/events` and stream proxy tags.
 */

export type CastMetricEvent =
  | "cast_prep_ok"
  | "cast_prep_fail"
  | "cast_load_ok"
  | "cast_playing"
  | "cast_stall"
  | "cast_idle_error"
  | "cast_session_fail"
  | "cast_resolve_ok"
  | "cast_resolve_fail"
  | "cast_stream_4xx"
  | "cast_stream_5xx"
  | "cast_stream_forbidden_ua";

const EVENTS: CastMetricEvent[] = [
  "cast_prep_ok",
  "cast_prep_fail",
  "cast_load_ok",
  "cast_playing",
  "cast_stall",
  "cast_idle_error",
  "cast_session_fail",
  "cast_resolve_ok",
  "cast_resolve_fail",
  "cast_stream_4xx",
  "cast_stream_5xx",
  "cast_stream_forbidden_ua",
];

type MinuteBucket = Partial<Record<CastMetricEvent, number>>;

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

export function recordCastMetric(event: CastMetricEvent, count = 1): void {
  if (!Number.isFinite(count) || count <= 0) return;
  if (!EVENTS.includes(event)) return;
  tickMinute();
  const bucket = buckets.get(lastMinute) ?? {};
  bucket[event] = (bucket[event] ?? 0) + count;
  buckets.set(lastMinute, bucket);
}

function emptyTotals(): Record<CastMetricEvent, number> {
  return Object.fromEntries(EVENTS.map((e) => [e, 0])) as Record<
    CastMetricEvent,
    number
  >;
}

function sumWindow(minutesBack: number): Record<CastMetricEvent, number> {
  const out = emptyTotals();
  const end = lastMinute;
  const start = end - minutesBack + 1;
  for (const [minute, bucket] of buckets) {
    if (minute < start || minute > end) continue;
    for (const ev of EVENTS) {
      out[ev] += bucket[ev] ?? 0;
    }
  }
  return out;
}

export type CastMetricsSnapshot = {
  windowMinutes: number;
  last15Min: Record<CastMetricEvent, number>;
  last60Min: Record<CastMetricEvent, number>;
};

export function getCastMetrics(): CastMetricsSnapshot {
  tickMinute();
  return {
    windowMinutes: WINDOW_MINUTES,
    last15Min: sumWindow(15),
    last60Min: sumWindow(60),
  };
}

/** Vitest isolation */
export function resetCastMetricsForTests(): void {
  buckets.clear();
  lastMinute = Math.floor(Date.now() / 60_000);
}

export function isCastMetricEvent(value: string): value is CastMetricEvent {
  return (EVENTS as string[]).includes(value);
}
