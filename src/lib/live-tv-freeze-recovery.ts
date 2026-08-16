/**
 * Samsung Tizen / webOS / Silk live freezes often look like a wedged MSE decoder:
 * currentTime stops and `timeupdate` stops firing.
 *
 * Auto `startLoad(-1)` / pipeline rebuild snaps the live edge (repeat + jump).
 * This policy only nudges playback, and only after a long true freeze — not a
 * normal IPTV rebuffer.
 */

export const TV_LIVE_FREEZE_STUCK_MS = 16_000;
export const TV_LIVE_DECODER_STALL_MS = 10_000;
export const TV_LIVE_RECOVERY_COOLDOWN_MS = 20_000;
export const TV_LIVE_MIN_PLAYHEAD_SEC = 3;
export const TV_LIVE_BUFFER_AHEAD_MIN_SEC = 1.5;
export const TV_LIVE_PLAYHEAD_EPS_SEC = 0.25;

export type TvLiveFreezeAction = "none" | "play" | "media" | "reload";

/** 0 = next is play(), 1 = recoverMediaError, 2 = startLoad() (not live-edge). */
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
  /** Buffered time immediately after currentTime, not the farthest range. */
  bufferAheadSec: number;
  readyState: number;
  recoveryStep: TvLiveFreezeStep;
  lastRecoveryAtMs: number;
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

  if (input.recoveryStep === 0) return "play";
  if (input.recoveryStep === 1) return "media";
  if (input.recoveryStep === 2) return "reload";
  return "none";
}

export function stepAfterTvLiveFreezeAction(
  action: TvLiveFreezeAction
): TvLiveFreezeStep {
  if (action === "play") return 1;
  if (action === "media") return 2;
  return 2;
}
