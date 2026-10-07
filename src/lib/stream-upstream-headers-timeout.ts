/**
 * Time limit for an upstream to send response headers.
 * The timer is cleared once headers arrive, so a long VOD or MPEG-TS body
 * is not cut off. A slow or hung provider (multi-tens of seconds, then 451)
 * used to hold the Node process until the client gave up.
 */
export function streamProxyHeadersTimeoutMs(): number {
  const raw = process.env.STREAM_PROXY_HEADERS_TIMEOUT_MS;
  if (raw === undefined || raw === "") return 15_000;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1000) return 15_000;
  return Math.min(Math.floor(n), 60_000);
}

export function createHeadersTimeoutSignal(
  clientSignal: AbortSignal | null | undefined,
  timeoutMs: number
): { signal: AbortSignal; cancelTimeout: () => void } {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const signal = clientSignal
    ? AbortSignal.any([clientSignal, timeout.signal])
    : timeout.signal;
  return {
    signal,
    cancelTimeout: () => clearTimeout(timer),
  };
}

export async function fetchWithHeadersTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const { signal, cancelTimeout } = createHeadersTimeoutSignal(
    init.signal,
    timeoutMs
  );
  try {
    return await fetchImpl(url, { ...init, signal });
  } finally {
    cancelTimeout();
  }
}
