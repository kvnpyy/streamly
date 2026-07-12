import { describe, expect, it } from "vitest";
import {
  PLAYER_BACKGROUND_SUSPEND_MS,
  PLAYER_LONG_BACKGROUND_MS,
  planBackgroundRecovery,
  shouldDeferBackgroundSuspend,
} from "@/lib/player-page-lifecycle";

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

  it("uses gentle hls for short chromium live background", () => {
    expect(
      planBackgroundRecovery({
        hiddenMs: 12_000,
        isAppleMobileWebKit: false,
        hasHls: true,
        contentKind: "live",
      })
    ).toEqual({ action: "gentle-hls" });
  });

  it("uses soft hls for long chromium live background", () => {
    expect(
      planBackgroundRecovery({
        hiddenMs: PLAYER_LONG_BACKGROUND_MS,
        isAppleMobileWebKit: false,
        hasHls: true,
        contentKind: "live",
      })
    ).toEqual({ action: "soft-hls" });
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
