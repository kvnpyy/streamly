/**
 * In-process counters for `/api/metrics` and capacity planning.
 * Single Node instance only — resets on restart/deploy.
 */

type StreamProxySnapshot = {
  requestsTotal: number;
  bytesOutTotal: number;
  active: number;
  activePeak: number;
  rpmWindow: number[];
};

const streamProxy: StreamProxySnapshot = {
  requestsTotal: 0,
  bytesOutTotal: 0,
  active: 0,
  activePeak: 0,
  rpmWindow: [],
};

const startedAt = Date.now();
let lastRpmMinute = Math.floor(Date.now() / 60_000);
let requestsThisMinute = 0;

function tickRpmWindow(): void {
  const minute = Math.floor(Date.now() / 60_000);
  while (lastRpmMinute < minute) {
    lastRpmMinute += 1;
    streamProxy.rpmWindow.push(requestsThisMinute);
    requestsThisMinute = 0;
    if (streamProxy.rpmWindow.length > 60) {
      streamProxy.rpmWindow.shift();
    }
  }
}

/** Call when a proxied stream request begins (after rate-limit gate). */
export function acquireStreamProxySlot(): () => void {
  tickRpmWindow();
  streamProxy.requestsTotal += 1;
  requestsThisMinute += 1;
  streamProxy.active += 1;
  if (streamProxy.active > streamProxy.activePeak) {
    streamProxy.activePeak = streamProxy.active;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    streamProxy.active = Math.max(0, streamProxy.active - 1);
  };
}

/** Add outbound bytes when Content-Length is known (manifests, small segments). */
export function recordStreamProxyBytes(n: number): void {
  if (!Number.isFinite(n) || n <= 0) return;
  streamProxy.bytesOutTotal += Math.floor(n);
}

export function getRuntimeMetrics() {
  tickRpmWindow();
  const mem = process.memoryUsage();
  const rpm = streamProxy.rpmWindow.length
    ? [...streamProxy.rpmWindow]
    : requestsThisMinute > 0
      ? [requestsThisMinute]
      : [];

  return {
    startedAt: new Date(startedAt).toISOString(),
    uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
    node: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      externalMb: Math.round(mem.external / 1024 / 1024),
    },
    streamProxy: {
      requestsTotal: streamProxy.requestsTotal,
      bytesOutTotal: streamProxy.bytesOutTotal,
      bytesOutGb: Number((streamProxy.bytesOutTotal / 1024 ** 3).toFixed(3)),
      active: streamProxy.active,
      activePeak: streamProxy.activePeak,
      rpmLast60: rpm,
      rpmP95: percentile(rpm, 95),
    },
  };
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, idx)] ?? 0;
}

/** Vitest isolation */
export function resetRuntimeMetricsForTests(): void {
  streamProxy.requestsTotal = 0;
  streamProxy.bytesOutTotal = 0;
  streamProxy.active = 0;
  streamProxy.activePeak = 0;
  streamProxy.rpmWindow = [];
  requestsThisMinute = 0;
  lastRpmMinute = Math.floor(Date.now() / 60_000);
}
