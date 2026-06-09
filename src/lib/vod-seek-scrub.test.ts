import { describe, expect, it } from "vitest";
import {
  displayScrubProgressPercent,
  scrubPercentToAbsoluteSec,
} from "@/lib/vod-seek-scrub";

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
