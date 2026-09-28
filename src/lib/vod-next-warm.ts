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
