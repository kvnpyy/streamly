/** Schedule work after idle — used to defer cloud sync and discovery shelves. */
export function scheduleWhenIdle(
  fn: () => void,
  timeoutMs = 2_500
): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) fn();
  };
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(run, { timeout: timeoutMs });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }
  const t = window.setTimeout(run, timeoutMs);
  return () => {
    cancelled = true;
    window.clearTimeout(t);
  };
}
