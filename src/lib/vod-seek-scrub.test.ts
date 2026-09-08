import { describe, expect, it } from "vitest";
import {
  displayScrubProgressPercent,
  resolveEffectiveVodDuration,
  scrubPercentToAbsoluteSec,
} from "@/lib/vod-seek-scrub";

describe("resolveEffectiveVodDuration", () => {
  it("hides the scale for live", () => {
    expect(
      resolveEffectiveVodDuration({
        isLive: true,
        titleDurationSec: 3600,
        mediaDurationSec: 3600,
      })
    ).toBe(0);
  });

  it("prefers the probed title length", () => {
    expect(
      resolveEffectiveVodDuration({
        isLive: false,
        titleDurationSec: 7200,
        mediaDurationSec: 240,
      })
    ).toBe(7200);
  });

  it("falls back to the media clock when the title probe is missing", () => {
    expect(
      resolveEffectiveVodDuration({
        isLive: false,
        titleDurationSec: 0,
        mediaDurationSec: 5400,
      })
    ).toBe(5400);
  });

  it("rejects Infinity so EVENT playlists do not unmount the seek bar", () => {
    expect(
      resolveEffectiveVodDuration({
        isLive: false,
        titleDurationSec: 0,
        mediaDurationSec: Number.POSITIVE_INFINITY,
      })
    ).toBe(0);
  });
});

describe("scrubPercentToAbsoluteSec", () => {
  it("maps 50% of a one-hour title to 30 minutes", () => {
    expect(scrubPercentToAbsoluteSec(50, 3600)).toBe(1800);
  });

  it("clamps to duration", () => {
    expect(scrubPercentToAbsoluteSec(100, 3600)).toBe(3599.75);
  });
});

describe("displayScrubProgressPercent", () => {
  it("keeps the local scrub position while dragging", () => {
    expect(displayScrubProgressPercent(true, 50, 0.64)).toBe(50);
  });

  it("follows playback when not scrubbing", () => {
    expect(displayScrubProgressPercent(false, 50, 0.64)).toBe(0.64);
  });

  it("models the 23s snap-back bug: playback at 0.64% must not win during scrub", () => {
    const at23SecOn1Hour = (23 / 3600) * 100;
    expect(displayScrubProgressPercent(true, 50, at23SecOn1Hour)).toBe(50);
    expect(
      scrubPercentToAbsoluteSec(
        displayScrubProgressPercent(true, 50, at23SecOn1Hour),
        3600
      )
    ).toBe(1800);
  });
});
