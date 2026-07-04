import { describe, expect, it } from "vitest";
import {
  pickBestAudioStreamIndex,
  type ProbedAudioStream,
} from "./vod-transcode-audio";

describe("pickBestAudioStreamIndex", () => {
  it("returns null when no streams", () => {
    expect(pickBestAudioStreamIndex([])).toBeNull();
  });

  it("prefers AAC over AC-3", () => {
    const streams: ProbedAudioStream[] = [
      { index: 2, codec: "ac3", channels: 6 },
      { index: 3, codec: "aac", channels: 2 },
    ];
    expect(pickBestAudioStreamIndex(streams)).toBe(3);
  });

  it("prefers stereo over commentary mono when codecs match", () => {
    const streams: ProbedAudioStream[] = [
      { index: 1, codec: "aac", channels: 1 },
      { index: 2, codec: "aac", channels: 2 },
    ];
    expect(pickBestAudioStreamIndex(streams)).toBe(2);
  });

  it("skips to second track when first has no codec metadata", () => {
    const streams: ProbedAudioStream[] = [
      { index: 1, codec: null, channels: 0 },
      { index: 4, codec: "aac", channels: 2 },
    ];
    expect(pickBestAudioStreamIndex(streams)).toBe(4);
  });
});
