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

/** Why the page reported background — visibility hide is not the same as teardown. */
export type BackgroundLifecycleReason = "visibility" | "pagehide" | "freeze";

/**
 * Desktop/laptop (and phone browsers) should keep playing on a normal tab hide —
 * same as YouTube / Netflix / Twitch. Living-room TVs still suspend so overnight
 * Silk/Tizen/webOS sleep cannot leave a stale MSE session.
 *
 * `pagehide` / `freeze` mean the OS is discarding or freezing the page: always
 * schedule suspend unless Picture-in-Picture is active (user opted into
 * multitasking).
 */
export function shouldScheduleBackgroundSuspend(opts: {
  reason: BackgroundLifecycleReason;
  isTvOrSilk: boolean;
  isPictureInPicture: boolean;
}): boolean {
  if (opts.isPictureInPicture) return false;
  if (opts.reason === "visibility") return opts.isTvOrSilk;
  return true;
}

/**
 * iOS / Memory Saver may pause the element without our `stopLoad`. Resume only
 * when we never suspended and playback was running at hide time.
 */
export function shouldSoftResumeUnsuspendedPlayback(opts: {
  wasPlayingWhenHidden: boolean;
  isVideoPaused: boolean;
  didSuspend: boolean;
}): boolean {
  if (opts.didSuspend) return false;
  return opts.wasPlayingWhenHidden && opts.isVideoPaused;
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
    /**
     * Live: never recoverMediaError / startLoad(-1) on wake. Those snap the
     * sliding window and look like the stream is repeating on Tizen/webOS.
     * startLoad() + play (resumeAfterSuspend) is enough after a real suspend.
     */
    return { action: "play" };
  }

  if (longHidden) return { action: "full-reinit" };
  return { action: "play" };
}
