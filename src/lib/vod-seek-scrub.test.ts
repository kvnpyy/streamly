import { describe, expect, it } from "vitest";
import {
  canCommitVodScrub,
  clientXToScrubPercent,
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

describe("canCommitVodScrub", () => {
  it("rejects unknown duration so a click cannot seek to 0", () => {
    expect(canCommitVodScrub(0)).toBe(false);
    expect(canCommitVodScrub(1)).toBe(false);
    expect(canCommitVodScrub(Number.POSITIVE_INFINITY)).toBe(false);
  });

  it("allows a real title length", () => {
    expect(canCommitVodScrub(3600)).toBe(true);
  });
});

describe("clientXToScrubPercent", () => {
  it("maps the middle of the track to 50", () => {
    expect(clientXToScrubPercent(250, 100, 300)).toBe(50);
  });

  it("clamps to the track edges", () => {
    expect(clientXToScrubPercent(0, 100, 300)).toBe(0);
    expect(clientXToScrubPercent(500, 100, 300)).toBe(100);
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
