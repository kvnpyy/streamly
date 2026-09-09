import { describe, expect, it } from "vitest";
import {
  applySafeLiveAbrCeiling,
  indexOfLowestSafeLevel,
  maxSafeLevelIndex,
  stabilizeBrowserFriendlyCodecs,
} from "@/lib/live-hls-playback";
import type { Level } from "hls.js";

function fakeLevel(partial: {
  height?: number;
  bitrate?: number;
  videoCodec?: string;
  audioCodec?: string;
}): Level {
  return {
    height: partial.height ?? 0,
    width: 0,
    bitrate: partial.bitrate ?? 0,
    videoCodec: partial.videoCodec,
    audioCodec: partial.audioCodec,
    attrs: {},
  } as Level;
}

function fakeHls(levels: Level[]) {
  return {
    levels,
    startLevel: -1,
    autoLevelCapping: -1,
    autoLevelEnabled: true,
    currentLevel: -1,
    audioTracks: [] as { audioCodec?: string }[],
    audioTrack: -1,
    removeLevel: (i: number) => {
      levels.splice(i, 1);
    },
  };
}

describe("safe live ABR ceiling", () => {
  const ladder = [
    fakeLevel({ height: 480, bitrate: 800_000, videoCodec: "avc1", audioCodec: "mp4a" }),
    fakeLevel({ height: 720, bitrate: 2_000_000, videoCodec: "avc1", audioCodec: "mp4a" }),
    fakeLevel({ height: 1080, bitrate: 5_000_000, videoCodec: "avc1", audioCodec: "mp4a" }),
    fakeLevel({ height: 1080, bitrate: 6_000_000, videoCodec: "hvc1", audioCodec: "ec-3" }),
  ];

  it("picks the highest remaining H.264 rung, not the lowest", () => {
    expect(indexOfLowestSafeLevel(ladder)).toBe(0);
    expect(maxSafeLevelIndex(ladder)).toBe(2);
  });

  it("desktop Auto starts and caps at the highest safe rung", () => {
    const levels = [...ladder];
    const hls = fakeHls(levels);
    applySafeLiveAbrCeiling(hls, { startAtLowest: false, pinToLowest: false });
    expect(hls.startLevel).toBe(2);
    expect(hls.autoLevelCapping).toBe(2);
  });

  it("phones start low but can climb to the highest safe rung", () => {
    const hls = fakeHls([...ladder]);
    applySafeLiveAbrCeiling(hls, { startAtLowest: true, pinToLowest: false });
    expect(hls.startLevel).toBe(0);
    expect(hls.autoLevelCapping).toBe(2);
  });

  it("TV stays pinned to the lowest safe rung", () => {
    const hls = fakeHls([...ladder]);
    applySafeLiveAbrCeiling(hls, { startAtLowest: true, pinToLowest: true });
    expect(hls.startLevel).toBe(0);
    expect(hls.autoLevelCapping).toBe(0);
  });

  it("stabilize on desktop does not pin Auto to 480p", () => {
    const levels = [...ladder];
    const hls = fakeHls(levels) as unknown as Parameters<
      typeof stabilizeBrowserFriendlyCodecs
    >[0];
    stabilizeBrowserFriendlyCodecs(hls, {
      isLive: true,
      livingRoomLike: false,
      silkLike: false,
      appleMobileLiveMse: false,
      mobilePhoneLive: false,
    });
    expect(hls.autoLevelCapping).toBe(maxSafeLevelIndex(hls.levels));
    expect(hls.autoLevelCapping).toBeGreaterThan(indexOfLowestSafeLevel(hls.levels));
  });
});
