import { describe, expect, it } from "vitest";
import {
  TV_LIVE_DECODER_STALL_MS,
  TV_LIVE_FREEZE_STUCK_MS,
  TV_LIVE_MAX_AUTO_REINITS,
  TV_LIVE_MIN_PLAYHEAD_SEC,
  TV_LIVE_RECOVERY_COOLDOWN_MS,
  bufferAheadSec,
  nextTvLiveFreezeAction,
  playheadLooksStuck,
  stepAfterTvLiveFreezeAction,
  type TvLiveFreezeInputs,
} from "@/lib/live-tv-freeze-recovery";

function base(over: Partial<TvLiveFreezeInputs> = {}): TvLiveFreezeInputs {
  return {
    nowMs: 20_000,
    currentTime: 45,
    lastCurrentTime: 45,
    paused: false,
    hasError: false,
    sawProgress: true,
    stuckMs: TV_LIVE_FREEZE_STUCK_MS,
    waitingMs: 0,
    bufferAheadSec: 0.1,
    readyState: 3,
    recoveryStep: 0,
    lastRecoveryAtMs: 0,
    reinitCount: 0,
    ...over,
  };
}

describe("bufferAheadSec", () => {
  it("uses the farthest buffered end", () => {
    const buffered = {
      length: 2,
      end: (i: number) => (i === 0 ? 10 : 40),
    };
    expect(bufferAheadSec(buffered, 38)).toBeCloseTo(2);
  });

  it("is zero with an empty buffer", () => {
    expect(bufferAheadSec({ length: 0, end: () => 0 }, 12)).toBe(0);
  });
});

describe("playheadLooksStuck", () => {
  it("ignores the first sample", () => {
    expect(playheadLooksStuck(12, -1)).toBe(false);
  });

  it("treats sub-0.2s motion as stuck", () => {
    expect(playheadLooksStuck(12.05, 12)).toBe(true);
    expect(playheadLooksStuck(12.4, 12)).toBe(false);
  });
});

describe("nextTvLiveFreezeAction", () => {
  it("does nothing while joining before the playhead is established", () => {
    expect(
      nextTvLiveFreezeAction(
        base({
          sawProgress: false,
          currentTime: TV_LIVE_MIN_PLAYHEAD_SEC - 0.5,
          lastCurrentTime: TV_LIVE_MIN_PLAYHEAD_SEC - 0.5,
        })
      )
    ).toBe("none");
  });

  it("does nothing when paused, errored, or the playhead is moving", () => {
    expect(nextTvLiveFreezeAction(base({ paused: true }))).toBe("none");
    expect(nextTvLiveFreezeAction(base({ hasError: true }))).toBe("none");
    expect(
      nextTvLiveFreezeAction(base({ currentTime: 48, lastCurrentTime: 45 }))
    ).toBe("none");
  });

  it("respects the recovery cooldown", () => {
    expect(
      nextTvLiveFreezeAction(
        base({
          nowMs: 12_000,
          lastRecoveryAtMs: 12_000 - (TV_LIVE_RECOVERY_COOLDOWN_MS - 200),
        })
      )
    ).toBe("none");
  });

  it("escalates gentle → soft → reinit on a frozen playhead", () => {
    expect(nextTvLiveFreezeAction(base({ recoveryStep: 0 }))).toBe("gentle");
    expect(nextTvLiveFreezeAction(base({ recoveryStep: 1 }))).toBe("soft");
    expect(nextTvLiveFreezeAction(base({ recoveryStep: 2 }))).toBe("reinit");
  });

  it("treats a waiting decoder with buffer ahead as a faster stall", () => {
    expect(
      nextTvLiveFreezeAction(
        base({
          stuckMs: 1_000,
          waitingMs: TV_LIVE_DECODER_STALL_MS,
          bufferAheadSec: 2,
          readyState: 3,
        })
      )
    ).toBe("gentle");
  });

  it("does not treat empty-buffer waiting as a decoder stall", () => {
    expect(
      nextTvLiveFreezeAction(
        base({
          stuckMs: 1_000,
          waitingMs: TV_LIVE_DECODER_STALL_MS,
          bufferAheadSec: 0.1,
          readyState: 2,
        })
      )
    ).toBe("none");
  });

  it("stops auto-reinit after the cap so a dead feed can surface an error", () => {
    expect(
      nextTvLiveFreezeAction(
        base({
          recoveryStep: 2,
          reinitCount: TV_LIVE_MAX_AUTO_REINITS,
        })
      )
    ).toBe("none");
  });

  it("advances the step after each recovery", () => {
    expect(stepAfterTvLiveFreezeAction("gentle")).toBe(1);
    expect(stepAfterTvLiveFreezeAction("soft")).toBe(2);
    expect(stepAfterTvLiveFreezeAction("reinit")).toBe(0);
    expect(stepAfterTvLiveFreezeAction("none")).toBe(0);
  });
});
