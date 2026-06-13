import { describe, expect, it } from "vitest";
import {
  normalizePlaybackSpeed,
  playbackSpeedLabel,
  PLAYBACK_SPEED_OPTIONS,
} from "./player-playback-speed";

describe("normalizePlaybackSpeed", () => {
  it("snaps to the nearest supported option", () => {
    expect(normalizePlaybackSpeed(1)).toBe(1);
    expect(normalizePlaybackSpeed(1.2)).toBe(1.25);
    expect(normalizePlaybackSpeed(0.6)).toBe(0.5);
  });

  it("defaults invalid values to normal speed", () => {
    expect(normalizePlaybackSpeed(Number.NaN)).toBe(1);
  });
});

describe("playbackSpeedLabel", () => {
  it("labels normal speed distinctly", () => {
    expect(playbackSpeedLabel(1)).toBe("Normal");
    expect(playbackSpeedLabel(1.5)).toBe("1.5×");
  });
});

describe("PLAYBACK_SPEED_OPTIONS", () => {
  it("includes normal speed", () => {
    expect(PLAYBACK_SPEED_OPTIONS).toContain(1);
  });
});
