import { describe, expect, it } from "vitest";
import {
  pickBestAudioStreamIndex,
  shouldDeferSilentAudioEncode,
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

  it("prefers a real AC-3 mix over an AAC stub with no channel count", () => {
    const streams: ProbedAudioStream[] = [
      { index: 1, codec: "aac", channels: 0 },
      { index: 2, codec: "ac3", channels: 6 },
    ];
    expect(pickBestAudioStreamIndex(streams)).toBe(2);
  });

  it("prefers surround AC-3 over a mono AAC commentary", () => {
    const streams: ProbedAudioStream[] = [
      { index: 1, codec: "aac", channels: 1 },
      { index: 2, codec: "eac3", channels: 6 },
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

describe("shouldDeferSilentAudioEncode", () => {
  it("waits while a partial file still shows no audio", () => {
    expect(
      shouldDeferSilentAudioEncode({
        audioStreamCount: 0,
        sourceComplete: false,
      })
    ).toBe(true);
  });

  it("encodes once a track is visible or the download is finished", () => {
    expect(
      shouldDeferSilentAudioEncode({
        audioStreamCount: 2,
        sourceComplete: false,
      })
    ).toBe(false);
    expect(
      shouldDeferSilentAudioEncode({
        audioStreamCount: 0,
        sourceComplete: true,
      })
    ).toBe(false);
  });
});
