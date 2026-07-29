/** In-playlist VOD scrub: playhead must land near the relative target. */
export const VOD_SEEK_LAND_TOLERANCE_SEC = 1.25;

/** Max verify retries (~6s) before giving up on an in-playlist scrub. */
export const VOD_SEEK_LAND_MAX_TRIES = 30;

export const VOD_SEEK_LAND_RETRY_MS = 200;

/**
 * After an intentional scrub, ignore tip `timeupdate` resume writes so a failed
 * land cannot re-bookmark the old tip (~1h45).
 */
export const VOD_SEEK_SUPPRESS_TIP_PERSIST_MS = 20_000;

/**
 * First media PTS often starts ~1–4s (not exactly 0). Treat near-start scrubs as
 * landed when the playhead is in the opening window — otherwise scrub-to-0 never
 * "lands" and the tip resume bookmark wins.
 */
export const VOD_SEEK_NEAR_START_LAND_SEC = 4;

export function vodSeekPlayheadLanded(
  currentRelativeSec: number,
  targetRelativeSec: number,
  toleranceSec = VOD_SEEK_LAND_TOLERANCE_SEC
): boolean {
  if (!Number.isFinite(currentRelativeSec) || !Number.isFinite(targetRelativeSec)) {
    return false;
  }
  if (
    targetRelativeSec <= 2 &&
    currentRelativeSec >= 0 &&
    currentRelativeSec <= Math.max(toleranceSec, VOD_SEEK_NEAR_START_LAND_SEC)
  ) {
    return true;
  }
  return Math.abs(currentRelativeSec - targetRelativeSec) <= toleranceSec;
}

export function shouldSuppressVodTipPersist(
  nowMs: number,
  suppressUntilMs: number
): boolean {
  return (
    Number.isFinite(suppressUntilMs) &&
    suppressUntilMs > 0 &&
    nowMs < suppressUntilMs
  );
}
