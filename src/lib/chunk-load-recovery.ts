/** sessionStorage guard — one automatic reload per tab session. */
export const CHUNK_RELOAD_SESSION_KEY = "streamly-chunk-reload-v1";

const CHUNK_FAILURE_RE =
  /ChunkLoadError|Failed to load chunk|Loading chunk [\da-z]+ failed|failed to fetch dynamically imported module/i;

export function isChunkLoadFailure(reason: unknown): boolean {
  if (!reason) return false;
  if (reason instanceof Error) {
    return (
      reason.name === "ChunkLoadError" || CHUNK_FAILURE_RE.test(reason.message)
    );
  }
  return CHUNK_FAILURE_RE.test(String(reason));
}

/**
 * Hard-reload with a cache-bust query after deploy when HTML still references
 * deleted `/_next/static/chunks/*` files (404/500 → ChunkLoadError).
 */
export function reloadForStaleChunks(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY)) return false;
    sessionStorage.setItem(CHUNK_RELOAD_SESSION_KEY, "1");
  } catch {
    /* private mode */
  }
  const url = new URL(window.location.href);
  url.searchParams.set("_sw", String(Date.now()));
  window.location.replace(url.toString());
  return true;
}

export function clearChunkReloadGuard(): void {
  try {
    sessionStorage.removeItem(CHUNK_RELOAD_SESSION_KEY);
  } catch {
    /* noop */
  }
}
