/**
 * When the next-episode card is up, we may start that episode's encode from
 * the beginning. A second provider download while this episode is still
 * fetching will stall the ending on screen.
 */

export function providerDownloadSlot(upstream: string): string {
  try {
    const u = new URL(upstream);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${u.host}|${parts[0]}|${parts[1]}`;
    return u.host;
  } catch {
    return upstream;
  }
}

export function sameProviderDownloadSlot(a: string, b: string): boolean {
  return providerDownloadSlot(a) === providerDownloadSlot(b);
}

export function nextEpisodeWarmAllowed(opts: {
  /** Null when the server has not reported source-cache progress. */
  sourcePct: number | null;
  encodedAbsSec: number;
  durationSec: number;
}): boolean {
  if (opts.sourcePct != null && Number.isFinite(opts.sourcePct)) {
    return opts.sourcePct >= 100;
  }
  const duration = opts.durationSec;
  const encoded = opts.encodedAbsSec;
  if (!(duration >= 8 * 60) || !Number.isFinite(encoded)) return false;
  return encoded >= duration - 45;
}

/**
 * A background warm must not open another provider download while the episode
 * on screen still needs that connection.
 *
 * `otherSourceComplete === null` means there is no local source cache, so
 * ffmpeg itself is the download.
 */
/**
 * A background warm must not count as someone watching. New jobs stamp
 * `lastViewerAt` at creation, which kept the warm's ffmpeg in a slot for the
 * idle window. Real episode plays then sat in the queue and the player logged
 * 503 until the warm expired.
 */
export function warmEncodeHoldsViewerSlot(opts: {
  backgroundWarm: boolean;
  hasPlayerViewer: boolean;
  lastViewerAt: number;
  now: number;
  idleMs: number;
}): boolean {
  if (opts.backgroundWarm && !opts.hasPlayerViewer) return false;
  if (!(opts.lastViewerAt > 0)) return false;
  return opts.now - opts.lastViewerAt < opts.idleMs;
}

export function warmWouldStealProviderDownload(opts: {
  otherViewerActive: boolean;
  otherSourceComplete: boolean | null;
  otherFfmpegRunning: boolean;
}): boolean {
  if (!opts.otherViewerActive) return false;
  if (opts.otherSourceComplete === false) return true;
  if (opts.otherSourceComplete == null && opts.otherFfmpegRunning) return true;
  return false;
}
