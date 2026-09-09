/** Finite media duration usable for the VOD seek bar (rejects Infinity / NaN). */
export function usableVodDurationSec(sec: number | null | undefined): number {
  if (sec == null || !Number.isFinite(sec) || sec <= 1 || sec >= 86_400) {
    return 0;
  }
  return sec;
}

/**
 * Seek-bar scale for VOD. Prefer the probed title length; fall back to the
 * media clock so the bar still mounts when transcode headers are late.
 */
export function resolveEffectiveVodDuration(opts: {
  isLive: boolean;
  titleDurationSec: number;
  mediaDurationSec: number;
  /** `<video>.duration` — EVENT transcode playlists often have this before ffprobe. */
  mediaClockSec?: number;
}): number {
  if (opts.isLive) return 0;
  return (
    usableVodDurationSec(opts.titleDurationSec) ||
    usableVodDurationSec(opts.mediaDurationSec) ||
    usableVodDurationSec(opts.mediaClockSec)
  );
}

/** Unknown duration maps every click to 0 — do not commit those seeks. */
export function canCommitVodScrub(durationSec: number): boolean {
  return Number.isFinite(durationSec) && durationSec > 1;
}

/** Map a pointer X on the seek track to 0–100. */
export function clientXToScrubPercent(
  clientX: number,
  trackLeft: number,
  trackWidth: number
): number | null {
  if (!Number.isFinite(clientX) || !Number.isFinite(trackLeft) || !(trackWidth > 0)) {
    return null;
  }
  return Math.max(0, Math.min(100, ((clientX - trackLeft) / trackWidth) * 100));
}

/** Map seek-bar percent (0–100) to absolute seconds on the full title timeline. */
export function scrubPercentToAbsoluteSec(
  progressPercent: number,
  durationSec: number
): number {
  if (!Number.isFinite(progressPercent) || !Number.isFinite(durationSec)) {
    return 0;
  }
  if (durationSec <= 0) return 0;
  return Math.max(
    0,
    Math.min(durationSec - 0.25, (progressPercent / 100) * durationSec)
  );
}

/**
 * While the user drags the seek bar, keep the thumb on the scrub target — not
 * on live playback time (which would snap back before pointer-up commits).
 */
export function displayScrubProgressPercent(
  scrubbing: boolean,
  localScrubPercent: number | null,
  playbackProgressPercent: number
): number {
  if (scrubbing && localScrubPercent != null) return localScrubPercent;
  return playbackProgressPercent;
}
