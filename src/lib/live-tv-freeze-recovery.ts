/**
 * Samsung Tizen / webOS / Silk live freezes often look like a wedged MSE decoder:
 * currentTime stops, `timeupdate` stops firing, and hls.js `waiting` is ignored.
 * Channel-flip works because it tears down the pipeline. This policy auto-escalates
 * that same recovery without the user leaving the event.
 */

export const TV_LIVE_FREEZE_STUCK_MS = 7_000;
export const TV_LIVE_DECODER_STALL_MS = 4_000;
export const TV_LIVE_RECOVERY_COOLDOWN_MS = 8_000;
export const TV_LIVE_MIN_PLAYHEAD_SEC = 2;
export const TV_LIVE_MAX_AUTO_REINITS = 3;
export const TV_LIVE_BUFFER_AHEAD_MIN_SEC = 0.75;
export const TV_LIVE_PLAYHEAD_EPS_SEC = 0.2;

export type TvLiveFreezeAction = "none" | "gentle" | "soft" | "reinit";

/** 0 = next is gentle, 1 = next is soft, 2 = next is reinit. */
export type TvLiveFreezeStep = 0 | 1 | 2;

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
  bufferAheadSec: number;
  readyState: number;
  recoveryStep: TvLiveFreezeStep;
  lastRecoveryAtMs: number;
  reinitCount: number;
};

export function bufferAheadSec(
  buffered: { length: number; end: (i: number) => number },
  currentTime: number
): number {
  if (!buffered.length) return 0;
  let end = 0;
  for (let i = 0; i < buffered.length; i++) {
    end = Math.max(end, buffered.end(i));
  }
  return end - currentTime;
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

export function nextTvLiveFreezeAction(
  input: TvLiveFreezeInputs
): TvLiveFreezeAction {
  if (input.paused || input.hasError) return "none";
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

  if (input.recoveryStep === 0) return "gentle";
  if (input.recoveryStep === 1) return "soft";
  if (input.reinitCount >= TV_LIVE_MAX_AUTO_REINITS) return "none";
  return "reinit";
}

export function stepAfterTvLiveFreezeAction(
  action: TvLiveFreezeAction
): TvLiveFreezeStep {
  if (action === "gentle") return 1;
  if (action === "soft") return 2;
  return 0;
}
