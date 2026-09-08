import { describe, expect, it } from "vitest";
import {
  PLAYER_BACKGROUND_SUSPEND_MS,
  PLAYER_LONG_BACKGROUND_MS,
  planBackgroundRecovery,
  shouldDeferBackgroundSuspend,
  shouldScheduleBackgroundSuspend,
  shouldSoftResumeUnsuspendedPlayback,
} from "@/lib/player-page-lifecycle";

describe("shouldScheduleBackgroundSuspend", () => {
  it("does not pause desktop/phone tab hide", () => {
    expect(
      shouldScheduleBackgroundSuspend({
        reason: "visibility",
        isTvOrSilk: false,
        isPictureInPicture: false,
      })
    ).toBe(false);
  });

  it("still suspends TV visibility hide after the flicker delay", () => {
    expect(
      shouldScheduleBackgroundSuspend({
        reason: "visibility",
        isTvOrSilk: true,
        isPictureInPicture: false,
      })
    ).toBe(true);
  });

  it("never suspends while Picture-in-Picture is active", () => {
    expect(
      shouldScheduleBackgroundSuspend({
        reason: "visibility",
        isTvOrSilk: true,
        isPictureInPicture: true,
      })
    ).toBe(false);
    expect(
      shouldScheduleBackgroundSuspend({
        reason: "pagehide",
        isTvOrSilk: false,
        isPictureInPicture: true,
      })
    ).toBe(false);
    expect(
      shouldScheduleBackgroundSuspend({
        reason: "freeze",
        isTvOrSilk: false,
        isPictureInPicture: true,
      })
    ).toBe(false);
  });

  it("schedules suspend on pagehide and freeze for desktop", () => {
    expect(
      shouldScheduleBackgroundSuspend({
        reason: "pagehide",
        isTvOrSilk: false,
        isPictureInPicture: false,
      })
    ).toBe(true);
    expect(
      shouldScheduleBackgroundSuspend({
        reason: "freeze",
        isTvOrSilk: false,
        isPictureInPicture: false,
      })
    ).toBe(true);
  });
});

describe("shouldSoftResumeUnsuspendedPlayback", () => {
  it("resumes when the OS paused a stream we left playing", () => {
    expect(
      shouldSoftResumeUnsuspendedPlayback({
        wasPlayingWhenHidden: true,
        isVideoPaused: true,
        didSuspend: false,
      })
    ).toBe(true);
  });

  it("does not resume a user-paused or still-playing video", () => {
    expect(
      shouldSoftResumeUnsuspendedPlayback({
        wasPlayingWhenHidden: false,
        isVideoPaused: true,
        didSuspend: false,
      })
    ).toBe(false);
    expect(
      shouldSoftResumeUnsuspendedPlayback({
        wasPlayingWhenHidden: true,
        isVideoPaused: false,
        didSuspend: false,
      })
    ).toBe(false);
  });

  it("does not soft-resume after a real suspend", () => {
    expect(
      shouldSoftResumeUnsuspendedPlayback({
        wasPlayingWhenHidden: true,
        isVideoPaused: true,
        didSuspend: true,
      })
    ).toBe(false);
  });
});

describe("shouldDeferBackgroundSuspend", () => {
  it("defers suspend during brief TV visibility flickers", () => {
    expect(shouldDeferBackgroundSuspend(0)).toBe(true);
    expect(shouldDeferBackgroundSuspend(PLAYER_BACKGROUND_SUSPEND_MS - 1)).toBe(
      true
    );
  });

  it("allows suspend after the background threshold", () => {
    expect(shouldDeferBackgroundSuspend(PLAYER_BACKGROUND_SUSPEND_MS)).toBe(
      false
    );
  });
});

describe("planBackgroundRecovery", () => {
  it("ignores very short background", () => {
    expect(
      planBackgroundRecovery({
        hiddenMs: PLAYER_BACKGROUND_SUSPEND_MS - 1,
        isAppleMobileWebKit: false,
        hasHls: true,
        contentKind: "live",
      })
    ).toEqual({ action: "none" });
  });

  it("resumes live with play only — no media-recover or live-edge snap", () => {
    expect(
      planBackgroundRecovery({
        hiddenMs: 12_000,
        isAppleMobileWebKit: false,
        hasHls: true,
        contentKind: "live",
      })
    ).toEqual({ action: "play" });
    expect(
      planBackgroundRecovery({
        hiddenMs: PLAYER_LONG_BACKGROUND_MS,
        isAppleMobileWebKit: false,
        hasHls: true,
        contentKind: "live",
      })
    ).toEqual({ action: "play" });
  });

  it("full reinit for chromium live when hls instance is gone", () => {
    expect(
      planBackgroundRecovery({
        hiddenMs: 12_000,
        isAppleMobileWebKit: false,
        hasHls: false,
        contentKind: "live",
      })
    ).toEqual({ action: "full-reinit" });
  });

  it("play only for short iOS background", () => {
    expect(
      planBackgroundRecovery({
        hiddenMs: 12_000,
        isAppleMobileWebKit: true,
        hasHls: false,
        contentKind: "live",
      })
    ).toEqual({ action: "play" });
  });

  it("full reinit for long iOS background (native HLS)", () => {
    expect(
      planBackgroundRecovery({
        hiddenMs: PLAYER_LONG_BACKGROUND_MS,
        isAppleMobileWebKit: true,
        hasHls: false,
        contentKind: "live",
      })
    ).toEqual({ action: "full-reinit" });
  });

  it("full reinit for long vod background on desktop", () => {
    expect(
      planBackgroundRecovery({
        hiddenMs: PLAYER_LONG_BACKGROUND_MS,
        isAppleMobileWebKit: false,
        hasHls: true,
        contentKind: "vod",
      })
    ).toEqual({ action: "full-reinit" });
  });

  it("play for short vod background on desktop", () => {
    expect(
      planBackgroundRecovery({
        hiddenMs: 20_000,
        isAppleMobileWebKit: false,
        hasHls: false,
        contentKind: "series",
      })
    ).toEqual({ action: "play" });
  });
});
