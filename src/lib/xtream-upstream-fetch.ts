const RETRY_STATUSES = new Set([502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Fetch an Xtream panel URL with short retries on transient upstream failures.
 */
export async function fetchXtreamPanelWithRetry(
  url: string,
  init: RequestInit & { signal?: AbortSignal },
  opts?: { attempts?: number }
): Promise<Response> {
  const attempts = opts?.attempts ?? 3;
  let last: Response | undefined;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      last = res;
      if (!RETRY_STATUSES.has(res.status) || i === attempts - 1) return res;
    } catch (e) {
      lastErr = e;
      if (i === attempts - 1) throw e;
    }
    await sleep(220 * (i + 1));
  }

  if (last) return last;
  throw lastErr ?? new Error("upstream fetch failed");
}
