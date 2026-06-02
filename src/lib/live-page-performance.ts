/** Live TV page — defer heavy shelf UI until catalog is loaded and main thread is idle. */

export const LIVE_BROWSE_UI_DEFER_MS = 600;

export function scheduleLiveBrowseUiReady(
  onReady: () => void,
  delayMs = LIVE_BROWSE_UI_DEFER_MS
): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) onReady();
  };
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(run, { timeout: delayMs + 600 });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }
  const t = window.setTimeout(run, delayMs);
  return () => {
    cancelled = true;
    window.clearTimeout(t);
  };
}
