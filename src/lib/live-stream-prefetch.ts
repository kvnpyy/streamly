import { withLiveHlsCompatMse } from "@/lib/stream-url";

const MAX_TRACKED = 120;
const prefetched = new Set<string>();
const order: string[] = [];

function remember(url: string): void {
  if (prefetched.has(url)) return;
  prefetched.add(url);
  order.push(url);
  while (order.length > MAX_TRACKED) {
    const old = order.shift();
    if (old) prefetched.delete(old);
  }
}

/**
 * Warm the manifest path before the user presses play (focus / hover on a channel).
 * Uses HEAD to avoid pulling segment data; failures are ignored.
 */
export function prefetchLiveStreamManifest(proxyUrl: string): void {
  if (typeof window === "undefined" || !proxyUrl.includes("/api/stream")) return;
  const url = withLiveHlsCompatMse(proxyUrl, true);
  remember(url);
  const ac = new AbortController();
  const timer = window.setTimeout(() => ac.abort(), 8_000);
  void fetch(url, {
    method: "HEAD",
    cache: "no-store",
    credentials: "same-origin",
    signal: ac.signal,
  })
    .catch(() => {
      /* offline / provider error — ignore */
    })
    .finally(() => window.clearTimeout(timer));
}
