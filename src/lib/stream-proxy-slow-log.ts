export function streamSlowLogThresholdMs(): number {
  const raw = process.env.STREAM_PROXY_SLOW_LOG_MS;
  if (raw === undefined || raw === "") return 2000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 2000;
  return Math.min(Math.floor(n), 300_000);
}

export function isStreamSlowLogDisabled(): boolean {
  return process.env.STREAM_PROXY_SLOW_LOG_DISABLED === "1";
}

/** One JSON line per slow upstream; never includes paths, queries, or raw `u`. */
export function maybeLogStreamUpstreamSlow(payload: {
  requestId: string;
  durationMs: number;
  streamType: string;
  upstreamHost: string;
  upstreamStatus: number | null;
}): void {
  if (isStreamSlowLogDisabled()) return;
  if (payload.durationMs < streamSlowLogThresholdMs()) return;
  console.warn(
    JSON.stringify({
      severity: "warn",
      event: "stream_upstream_slow",
      ...payload,
    })
  );
}
