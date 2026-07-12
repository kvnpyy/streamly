/** Shared thresholds for tab/TV background suspend and wake recovery. */
export const PLAYER_BACKGROUND_SUSPEND_MS = 5_000;

/** VOD transcode / stale MSE usually needs a full pipeline reinit after this long. */
export const PLAYER_LONG_BACKGROUND_MS = 60_000;

/**
 * Delay before pause/`stopLoad` on hide. Brief TV visibility flickers must not
 * suspend live playback — recovery used to ignore short backgrounds and left a
 * permanent black screen.
 */
export function shouldDeferBackgroundSuspend(
  hiddenMs: number,
  minSuspendMs = PLAYER_BACKGROUND_SUSPEND_MS
): boolean {
  return hiddenMs < minSuspendMs;
}

export type BackgroundContentKind = "live" | "vod" | "series";

export type BackgroundRecoveryPlan =
  | { action: "none" }
  | { action: "play" }
  | { action: "gentle-hls" }
  | { action: "soft-hls" }
  | { action: "full-reinit" };

/**
 * Decide how to recover playback after the player was suspended in the background.
 * Never returns a plan that implies sync `video.load()` on wake.
 */
export function planBackgroundRecovery(opts: {
  hiddenMs: number;
  isAppleMobileWebKit: boolean;
  hasHls: boolean;
  contentKind: BackgroundContentKind;
  minSuspendMs?: number;
  longBackgroundMs?: number;
}): BackgroundRecoveryPlan {
  const {
    hiddenMs,
    isAppleMobileWebKit,
    hasHls,
    contentKind,
    minSuspendMs = PLAYER_BACKGROUND_SUSPEND_MS,
    longBackgroundMs = PLAYER_LONG_BACKGROUND_MS,
  } = opts;

  if (hiddenMs < minSuspendMs) return { action: "none" };

  const isLive = contentKind === "live";
  const longHidden = hiddenMs >= longBackgroundMs;

  if (isAppleMobileWebKit) {
    if (longHidden) return { action: "full-reinit" };
    return { action: "play" };
  }

  if (isLive) {
    if (!hasHls) return { action: "full-reinit" };
    return { action: longHidden ? "soft-hls" : "gentle-hls" };
  }

  if (longHidden) return { action: "full-reinit" };
  return { action: "play" };
}
