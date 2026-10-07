/**
 * Samsung Tizen / webOS / Silk live freezes often look like a wedged MSE decoder:
 * currentTime stops and `timeupdate` stops firing.
 *
 * Auto `startLoad(-1)` on a healthy stream snaps the live edge (repeat + jump).
 * A true freeze still needs a last-resort pipeline rebuild — the same as
 * flipping away and back — because play() / recoverMediaError cannot unwedge
 * Tizen MSE once the decoder is dead.
 */

export const TV_LIVE_FREEZE_STUCK_MS = 16_000;
/** Silk/Tizen often paint one frame at t=0 and never advance. That is not a join. */
export const TV_LIVE_STARTUP_STALL_MS = 8_000;
export const TV_LIVE_DECODER_STALL_MS = 10_000;
export const TV_LIVE_RECOVERY_COOLDOWN_MS = 20_000;
export const TV_LIVE_MIN_PLAYHEAD_SEC = 3;
export const TV_LIVE_BUFFER_AHEAD_MIN_SEC = 1.5;
export const TV_LIVE_PLAYHEAD_EPS_SEC = 0.25;

export const TV_LIVE_MAX_AUTO_REINITS = 2;

export type TvLiveFreezeAction = "none" | "play" | "media" | "reload" | "reinit";

/** 0 = play(), 1 = recoverMediaError, 2 = startLoad(), 3 = full pipeline rebuild (channel flip). */
export type TvLiveFreezeStep = 0 | 1 | 2 | 3;

export type TvLiveFreezeInputs = {
  nowMs: number;
  currentTime: number;
  lastCurrentTime: number;
  paused: boolean;
  hasError: boolean;
  /** True once the playhead has advanced after join. */
  sawProgress: boolean;
  stuckMs: number;
  waitingMs: number;
  /** Buffered time immediately after currentTime, not the farthest range. */
  bufferAheadSec: number;
  readyState: number;
  recoveryStep: TvLiveFreezeStep;
  lastRecoveryAtMs: number;
  /** Fullscreen live: TVs often set paused=true without a user pause. */
  fullscreen?: boolean;
  /** Flip-equivalent rebuilds already attempted this freeze streak. */
  reinitCount?: number;
};

export function bufferAheadAtPlayhead(
  buffered: {
    length: number;
    start: (i: number) => number;
    end: (i: number) => number;
  },
  currentTime: number
): number {
  if (!buffered.length) return 0;
  for (let i = 0; i < buffered.length; i++) {
    const start = buffered.start(i);
    const end = buffered.end(i);
    if (currentTime >= start - 0.2 && currentTime <= end + 0.05) {
      return Math.max(0, end - currentTime);
    }
  }
  return 0;
}

export function playheadLooksStuck(
  currentTime: number,
  lastCurrentTime: number
): boolean {
  if (lastCurrentTime < 0) return false;
  return Math.abs(currentTime - lastCurrentTime) <= TV_LIVE_PLAYHEAD_EPS_SEC;
}

export function isTvLiveDecoderStall(opts: {
  waitingMs: number;
  bufferAheadSec: number;
  readyState: number;
  playheadStuck: boolean;
}): boolean {
  return (
    opts.playheadStuck &&
    opts.waitingMs >= TV_LIVE_DECODER_STALL_MS &&
    opts.bufferAheadSec >= TV_LIVE_BUFFER_AHEAD_MIN_SEC &&
    opts.readyState >= 2
  );
}

/**
 * A frame is on screen and the clock never left the opening. Manual restarts
 * on Fire TV Silk clear this; play() does not.
 */
export function isTvStartupFrameStall(input: TvLiveFreezeInputs): boolean {
  if (input.hasError) return false;
  if (input.paused && !input.fullscreen) return false;
  if (input.sawProgress) return false;
  if (input.currentTime >= TV_LIVE_MIN_PLAYHEAD_SEC) return false;
  if (input.readyState < 2) return false;
  if (input.stuckMs < TV_LIVE_STARTUP_STALL_MS) return false;
  if (
    input.lastRecoveryAtMs > 0 &&
    input.nowMs - input.lastRecoveryAtMs < TV_LIVE_RECOVERY_COOLDOWN_MS
  ) {
    return false;
  }
  return true;
}

export function nextTvLiveFreezeAction(
  input: TvLiveFreezeInputs
): TvLiveFreezeAction {
  if (input.hasError) return "none";
  if (input.paused && !input.fullscreen) return "none";
  if (isTvStartupFrameStall(input)) {
    if (input.recoveryStep < 2) return "reload";
    if ((input.reinitCount ?? 0) >= TV_LIVE_MAX_AUTO_REINITS) return "none";
    return "reinit";
  }
  if (!input.sawProgress && input.currentTime < TV_LIVE_MIN_PLAYHEAD_SEC) {
    return "none";
  }
  if (
    input.lastRecoveryAtMs > 0 &&
    input.nowMs - input.lastRecoveryAtMs < TV_LIVE_RECOVERY_COOLDOWN_MS
  ) {
    return "none";
  }

  const stuck = playheadLooksStuck(input.currentTime, input.lastCurrentTime);
  if (!stuck) return "none";

  const decoderStall = isTvLiveDecoderStall({
    waitingMs: input.waitingMs,
    bufferAheadSec: input.bufferAheadSec,
    readyState: input.readyState,
    playheadStuck: stuck,
  });
  const frozen = decoderStall || input.stuckMs >= TV_LIVE_FREEZE_STUCK_MS;
  if (!frozen) return "none";

  if (input.recoveryStep === 0) return "play";
  if (input.recoveryStep === 1) return "media";
  if (input.recoveryStep === 2) return "reload";
  if ((input.reinitCount ?? 0) >= TV_LIVE_MAX_AUTO_REINITS) return "none";
  return "reinit";
}

export function stepAfterTvLiveFreezeAction(
  action: TvLiveFreezeAction
): TvLiveFreezeStep {
  if (action === "play") return 1;
  if (action === "media") return 2;
  if (action === "reload") return 3;
  return 3;
}

/** TV keeps its play → media → reload ladder. Everyone else starts gently. */
export type LiveFreezePolicy = "tv" | "gentle";

/**
 * Desktop/phone decoder wedge: playhead stuck, data still buffered, element
 * has current data. Does not require the waiting flag — a wedged MSE decoder
 * often stays at readyState 3+ with a frozen clock.
 */
export function isGentleDecoderStall(input: {
  playheadStuck: boolean;
  bufferAheadSec: number;
  readyState: number;
}): boolean {
  return (
    input.playheadStuck &&
    input.bufferAheadSec >= TV_LIVE_BUFFER_AHEAD_MIN_SEC &&
    input.readyState >= 2
  );
}

function liveFreezeBlocked(input: TvLiveFreezeInputs): boolean {
  if (input.hasError) return true;
  if (input.paused && !input.fullscreen) return true;
  if (!input.sawProgress && input.currentTime < TV_LIVE_MIN_PLAYHEAD_SEC) {
    return true;
  }
  if (
    input.lastRecoveryAtMs > 0 &&
    input.nowMs - input.lastRecoveryAtMs < TV_LIVE_RECOVERY_COOLDOWN_MS
  ) {
    return true;
  }
  return false;
}

/**
 * Desktop/phone: first kick is always startLoad() at the playhead.
 * recoverMediaError, then a pipeline rebuild, only if the playhead is stuck
 * with buffer still ahead (decoder stall) after that kick.
 * Empty-buffer starvation never climbs into a seek.
 */
export function nextGentleLiveFreezeAction(
  input: TvLiveFreezeInputs
): TvLiveFreezeAction {
  if (liveFreezeBlocked(input)) return "none";
  const stuck = playheadLooksStuck(input.currentTime, input.lastCurrentTime);
  if (!stuck) return "none";
  const decoderStall = isGentleDecoderStall({
    playheadStuck: stuck,
    bufferAheadSec: input.bufferAheadSec,
    readyState: input.readyState,
  });
  const frozen = decoderStall || input.stuckMs >= TV_LIVE_FREEZE_STUCK_MS;
  if (!frozen) return "none";
  if (!decoderStall) return "reload";
  if (input.recoveryStep <= 0) return "reload";
  if (input.recoveryStep === 1) return "media";
  if ((input.reinitCount ?? 0) >= TV_LIVE_MAX_AUTO_REINITS) return "none";
  return "reinit";
}

export function stepAfterLiveFreezeAction(
  action: TvLiveFreezeAction,
  policy: LiveFreezePolicy,
  decoderStall: boolean
): TvLiveFreezeStep {
  if (policy === "gentle") {
    if (action === "reload" && decoderStall) return 1;
    if (action === "media") return 2;
    if (action === "reinit") return 3;
    return 0;
  }
  return stepAfterTvLiveFreezeAction(action);
}

/** reload / media / reinit are real recoveries. A bare play() is not. */
export function stuckRecoveryCountsTowardRemux(
  action: TvLiveFreezeAction
): boolean {
  return action === "reload" || action === "media" || action === "reinit";
}

export const LIVE_STUCK_RECOVERIES_BEFORE_REMUX = 2;

export function shouldSwitchLiveToRemux(opts: {
  stuckRecoveries: number;
  remuxActive: boolean;
  gaveUp: boolean;
}): boolean {
  return (
    !opts.remuxActive &&
    !opts.gaveUp &&
    opts.stuckRecoveries >= LIVE_STUCK_RECOVERIES_BEFORE_REMUX
  );
}

export type TvLiveFreezeWatchState = {
  lastCurrentTime: number;
  stuckSinceMs: number;
  waitingSinceMs: number;
  sawProgress: boolean;
  recoveryStep: TvLiveFreezeStep;
  lastRecoveryAtMs: number;
  reinitCount: number;
};

export function initialTvLiveFreezeWatchState(): TvLiveFreezeWatchState {
  return {
    lastCurrentTime: -1,
    stuckSinceMs: 0,
    waitingSinceMs: 0,
    sawProgress: false,
    recoveryStep: 0,
    lastRecoveryAtMs: 0,
    reinitCount: 0,
  };
}

export type TvLiveFreezeSample = {
  nowMs: number;
  currentTime: number;
  paused: boolean;
  hasError: boolean;
  readyState: number;
  bufferAheadSec: number;
  fullscreen?: boolean;
};

/**
 * Interval-safe freeze sampler. Tizen often stops firing `timeupdate` when the
 * decoder wedges — a 1s poll still sees a stuck playhead.
 */
export function sampleTvLiveFreezeWatch(
  prev: TvLiveFreezeWatchState,
  sample: TvLiveFreezeSample,
  policy: LiveFreezePolicy = "tv"
): { state: TvLiveFreezeWatchState; action: TvLiveFreezeAction } {
  const stuck = playheadLooksStuck(sample.currentTime, prev.lastCurrentTime);
  let stuckSinceMs = prev.stuckSinceMs;
  const userPaused = sample.paused && !sample.fullscreen;
  if (userPaused || !stuck || prev.lastCurrentTime < 0) {
    stuckSinceMs = sample.nowMs;
  }

  const waiting =
    !sample.paused && sample.readyState >= 1 && sample.readyState < 3;
  let waitingSinceMs = prev.waitingSinceMs;
  if (!waiting) waitingSinceMs = 0;
  else if (waitingSinceMs === 0) waitingSinceMs = sample.nowMs;

  const moved =
    prev.lastCurrentTime >= 0 &&
    sample.currentTime - prev.lastCurrentTime > TV_LIVE_PLAYHEAD_EPS_SEC;
  const sawProgress = prev.sawProgress || moved;

  const freezeInput: TvLiveFreezeInputs = {
    nowMs: sample.nowMs,
    currentTime: sample.currentTime,
    lastCurrentTime: prev.lastCurrentTime,
    paused: sample.paused,
    hasError: sample.hasError,
    sawProgress,
    stuckMs: sample.nowMs - stuckSinceMs,
    waitingMs: waitingSinceMs > 0 ? sample.nowMs - waitingSinceMs : 0,
    bufferAheadSec: sample.bufferAheadSec,
    readyState: sample.readyState,
    recoveryStep: prev.recoveryStep,
    lastRecoveryAtMs: prev.lastRecoveryAtMs,
    fullscreen: sample.fullscreen,
    reinitCount: prev.reinitCount,
  };
  const action =
    policy === "gentle"
      ? nextGentleLiveFreezeAction(freezeInput)
      : nextTvLiveFreezeAction(freezeInput);
  const gentleDecoderStall =
    policy === "gentle" &&
    isGentleDecoderStall({
      playheadStuck: playheadLooksStuck(
        sample.currentTime,
        prev.lastCurrentTime
      ),
      bufferAheadSec: sample.bufferAheadSec,
      readyState: sample.readyState,
    });

  const recovered = moved && action === "none";
  return {
    action,
    state: {
      lastCurrentTime: sample.currentTime,
      stuckSinceMs,
      waitingSinceMs,
      sawProgress,
      recoveryStep:
        action === "none"
          ? recovered
            ? 0
            : prev.recoveryStep
          : stepAfterLiveFreezeAction(action, policy, gentleDecoderStall),
      lastRecoveryAtMs:
        action === "none" ? prev.lastRecoveryAtMs : sample.nowMs,
      reinitCount: recovered
        ? 0
        : action === "reinit"
          ? prev.reinitCount + 1
          : prev.reinitCount,
    },
  };
}

/**
 * Tizen/webOS often pause MSE when the player enters or leaves fullscreen.
 * Reload if already paused; otherwise only nudge play() so we do not seek.
 */
export function tvLiveFullscreenResumeAction(opts: {
  paused: boolean;
  hasError: boolean;
}): TvLiveFreezeAction {
  if (opts.hasError) return "none";
  return opts.paused ? "reload" : "play";
}
