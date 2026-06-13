import { describe, expect, it } from "vitest";
import {
  isAtTranscodeBufferEdge,
  isNearEpisodeEnd,
  shouldTreatTranscodeAsEnded,
} from "./player-transcode-playback-end";

function mockVideo(opts: {
  currentTime: number;
  bufferedEnd: number;
  paused?: boolean;
  ended?: boolean;
}): HTMLVideoElement {
  const ranges = {
    length: opts.bufferedEnd > 0 ? 1 : 0,
    start: () => 0,
    end: () => opts.bufferedEnd,
  };
  return {
    currentTime: opts.currentTime,
    buffered: ranges,
    paused: opts.paused ?? false,
    ended: opts.ended ?? false,
  } as unknown as HTMLVideoElement;
}

describe("isNearEpisodeEnd", () => {
  it("is true inside the finale margin", () => {
    expect(isNearEpisodeEnd(3565, 3600)).toBe(true);
    expect(isNearEpisodeEnd(3500, 3600)).toBe(false);
  });
});

describe("isAtTranscodeBufferEdge", () => {
  it("detects when the playhead is at the buffer end", () => {
    expect(
      isAtTranscodeBufferEdge(mockVideo({ currentTime: 118, bufferedEnd: 118.5 }))
    ).toBe(true);
    expect(
      isAtTranscodeBufferEdge(mockVideo({ currentTime: 100, bufferedEnd: 120 }))
    ).toBe(false);
  });
});

describe("shouldTreatTranscodeAsEnded", () => {
  it("ends at the finale when the buffer is exhausted", () => {
    expect(
      shouldTreatTranscodeAsEnded({
        video: mockVideo({ currentTime: 1655, bufferedEnd: 1655.4 }),
        startOffsetSec: 1943,
        durationSec: 3601,
        encodedSecRel: 1660,
      })
    ).toBe(true);
  });

  it("does not end mid-episode when only the encode edge is reached", () => {
    expect(
      shouldTreatTranscodeAsEnded({
        video: mockVideo({ currentTime: 118, bufferedEnd: 118.5 }),
        startOffsetSec: 0,
        durationSec: 3600,
        encodedSecRel: 120,
      })
    ).toBe(false);
  });
});
