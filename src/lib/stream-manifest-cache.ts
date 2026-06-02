/**
 * Short TTL cache for rewritten HLS manifests on `/api/stream`.
 * Live playlists are polled every few seconds; caching avoids re-fetching and
 * re-writing the same upstream manifest on every hls.js poll (major CPU + latency win).
 */

type Entry = { body: string; expiresAt: number };

const store = new Map<string, Entry>();

const DEFAULT_TTL_MS = 2000;
/** Live HLS playlists poll often — slightly longer TTL cuts VPS CPU without stale offline detection. */
export const LIVE_HLS_MANIFEST_CACHE_TTL_MS = 3_500;
const MAX_ENTRIES = 800;

export function manifestCacheKey(parts: {
  upstream: string;
  compatMse: boolean;
  forCast: boolean;
}): string {
  return `${parts.upstream}\x1f${parts.compatMse ? "1" : "0"}\x1f${parts.forCast ? "1" : "0"}`;
}

export function getCachedManifest(key: string, nowMs = Date.now()): string | null {
  const hit = store.get(key);
  if (!hit || hit.expiresAt <= nowMs) {
    if (hit) store.delete(key);
    return null;
  }
  return hit.body;
}

export function setCachedManifest(
  key: string,
  body: string,
  ttlMs = DEFAULT_TTL_MS,
  nowMs = Date.now()
): void {
  if (store.size >= MAX_ENTRIES) {
    const cutoff = nowMs;
    for (const [k, v] of store) {
      if (v.expiresAt <= cutoff) store.delete(k);
    }
    if (store.size >= MAX_ENTRIES) {
      const first = store.keys().next().value;
      if (first) store.delete(first);
    }
  }
  store.set(key, { body, expiresAt: nowMs + Math.max(200, ttlMs) });
}

export function clearManifestCache(): void {
  store.clear();
}
