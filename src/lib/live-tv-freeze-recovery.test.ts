import { describe, expect, it } from "vitest";
import {
  TV_LIVE_DECODER_STALL_MS,
  TV_LIVE_FREEZE_STUCK_MS,
  TV_LIVE_MAX_AUTO_REINITS,
  TV_LIVE_MIN_PLAYHEAD_SEC,
  TV_LIVE_RECOVERY_COOLDOWN_MS,
  bufferAheadAtPlayhead,
  initialTvLiveFreezeWatchState,
  nextTvLiveFreezeAction,
  playheadLooksStuck,
  sampleTvLiveFreezeWatch,
  stepAfterTvLiveFreezeAction,
  tvLiveFullscreenResumeAction,
  type TvLiveFreezeInputs,
} from "@/lib/live-tv-freeze-recovery";

function base(over: Partial<TvLiveFreezeInputs> = {}): TvLiveFreezeInputs {
  return {
    nowMs: 40_000,
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
    ...over,
  };
}

describe("bufferAheadAtPlayhead", () => {
  it("only counts the range that contains the playhead", () => {
    const buffered = {
      length: 2,
      start: (i: number) => (i === 0 ? 0 : 80),
      end: (i: number) => (i === 0 ? 12 : 120),
    };
    expect(bufferAheadAtPlayhead(buffered, 10)).toBeCloseTo(2);
    expect(bufferAheadAtPlayhead(buffered, 40)).toBe(0);
  });

  it("is zero with an empty buffer", () => {
    expect(
      bufferAheadAtPlayhead({ length: 0, start: () => 0, end: () => 0 }, 12)
    ).toBe(0);
  });
});

describe("playheadLooksStuck", () => {
  it("ignores the first sample", () => {
    expect(playheadLooksStuck(12, -1)).toBe(false);
  });

  it("treats sub-0.25s motion as stuck", () => {
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
          nowMs: 30_000,
          lastRecoveryAtMs: 30_000 - (TV_LIVE_RECOVERY_COOLDOWN_MS - 200),
        })
      )
    ).toBe("none");
  });

  it("escalates play → media → reload → reinit (channel-flip rebuild)", () => {
    expect(nextTvLiveFreezeAction(base({ recoveryStep: 0 }))).toBe("play");
    expect(nextTvLiveFreezeAction(base({ recoveryStep: 1 }))).toBe("media");
    expect(nextTvLiveFreezeAction(base({ recoveryStep: 2 }))).toBe("reload");
    expect(nextTvLiveFreezeAction(base({ recoveryStep: 3 }))).toBe("reinit");
    expect(
      nextTvLiveFreezeAction(
        base({ recoveryStep: 3, reinitCount: TV_LIVE_MAX_AUTO_REINITS })
      )
    ).toBe("none");
  });

  it("does not treat a short wait with distant buffer as a decoder stall", () => {
    expect(
      nextTvLiveFreezeAction(
        base({
          stuckMs: 1_000,
          waitingMs: 4_000,
          bufferAheadSec: 40,
          readyState: 3,
        })
      )
    ).toBe("none");
  });

  it("treats a long wait with data at the playhead as a decoder stall", () => {
    expect(
      nextTvLiveFreezeAction(
        base({
          stuckMs: 1_000,
          waitingMs: TV_LIVE_DECODER_STALL_MS,
          bufferAheadSec: 2,
          readyState: 3,
        })
      )
    ).toBe("play");
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

  it("advances the step without resetting to a snap path", () => {
    expect(stepAfterTvLiveFreezeAction("play")).toBe(1);
    expect(stepAfterTvLiveFreezeAction("media")).toBe(2);
    expect(stepAfterTvLiveFreezeAction("reload")).toBe(3);
    expect(stepAfterTvLiveFreezeAction("reinit")).toBe(3);
    expect(stepAfterTvLiveFreezeAction("none")).toBe(3);
  });

  it("recovers a paused fullscreen freeze the way a channel flip would", () => {
    expect(
      nextTvLiveFreezeAction(
        base({
          paused: true,
          fullscreen: true,
          recoveryStep: 3,
        })
      )
    ).toBe("reinit");
    expect(
      nextTvLiveFreezeAction(
        base({
          paused: true,
          fullscreen: false,
          recoveryStep: 3,
        })
      )
    ).toBe("none");
  });
});

describe("sampleTvLiveFreezeWatch", () => {
  it("escalates after a long stuck playhead even if timeupdate would have stopped", () => {
    let state = initialTvLiveFreezeWatchState();
    const tick = (nowMs: number, currentTime: number) => {
      const out = sampleTvLiveFreezeWatch(state, {
        nowMs,
        currentTime,
        paused: false,
        hasError: false,
        readyState: 3,
        bufferAheadSec: 4,
      });
      state = out.state;
      return out.action;
    };

    expect(tick(0, 12)).toBe("none");
    expect(tick(1_000, 14)).toBe("none");
    expect(tick(2_000, 14)).toBe("none");
    expect(tick(2_000 + TV_LIVE_FREEZE_STUCK_MS, 14)).toBe("play");
    expect(tick(2_000 + TV_LIVE_FREEZE_STUCK_MS + 21_000, 14)).toBe("media");
    expect(tick(2_000 + TV_LIVE_FREEZE_STUCK_MS + 42_000, 14)).toBe("reload");
    expect(tick(2_000 + TV_LIVE_FREEZE_STUCK_MS + 63_000, 14)).toBe("reinit");
  });

  it("does not recover a user pause", () => {
    let state = initialTvLiveFreezeWatchState();
    const playing = sampleTvLiveFreezeWatch(state, {
      nowMs: 0,
      currentTime: 20,
      paused: false,
      hasError: false,
      readyState: 3,
      bufferAheadSec: 4,
    });
    state = playing.state;
    const held = sampleTvLiveFreezeWatch(state, {
      nowMs: TV_LIVE_FREEZE_STUCK_MS + 5_000,
      currentTime: 20,
      paused: true,
      hasError: false,
      readyState: 3,
      bufferAheadSec: 4,
    });
    expect(held.action).toBe("none");
  });
});

describe("tvLiveFullscreenResumeAction", () => {
  it("reloads when fullscreen paused the element, otherwise only plays", () => {
    expect(
      tvLiveFullscreenResumeAction({ paused: true, hasError: false })
    ).toBe("reload");
    expect(
      tvLiveFullscreenResumeAction({ paused: false, hasError: false })
    ).toBe("play");
    expect(
      tvLiveFullscreenResumeAction({ paused: true, hasError: true })
    ).toBe("none");
  });
});
