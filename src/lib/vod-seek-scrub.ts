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
