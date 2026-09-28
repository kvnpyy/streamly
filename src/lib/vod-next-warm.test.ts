import { describe, expect, it } from "vitest";
import {
  nextEpisodeWarmAllowed,
  sameProviderDownloadSlot,
  warmWouldStealProviderDownload,
} from "./vod-next-warm";

describe("nextEpisodeWarmAllowed", () => {
  it("waits until this episode's download has finished", () => {
    expect(
      nextEpisodeWarmAllowed({
        sourcePct: 40,
        encodedAbsSec: 2000,
        durationSec: 2400,
      })
    ).toBe(false);
    expect(
      nextEpisodeWarmAllowed({
        sourcePct: 100,
        encodedAbsSec: 500,
        durationSec: 2400,
      })
    ).toBe(true);
  });

  it("without a source-cache header, waits until the encode reaches the finale", () => {
    expect(
      nextEpisodeWarmAllowed({
        sourcePct: null,
        encodedAbsSec: 1800,
        durationSec: 2400,
      })
    ).toBe(false);
    expect(
      nextEpisodeWarmAllowed({
        sourcePct: null,
        encodedAbsSec: 2360,
        durationSec: 2400,
      })
    ).toBe(true);
  });
});

describe("warmWouldStealProviderDownload", () => {
  it("allows a warm once the episode on screen is fully on disk", () => {
    expect(
      warmWouldStealProviderDownload({
        otherViewerActive: true,
        otherSourceComplete: true,
        otherFfmpegRunning: true,
      })
    ).toBe(false);
  });

  it("blocks a warm while another viewer is still downloading", () => {
    expect(
      warmWouldStealProviderDownload({
        otherViewerActive: true,
        otherSourceComplete: false,
        otherFfmpegRunning: true,
      })
    ).toBe(true);
  });

  it("blocks a direct ffmpeg read of the provider while that encode is running", () => {
    expect(
      warmWouldStealProviderDownload({
        otherViewerActive: true,
        otherSourceComplete: null,
        otherFfmpegRunning: true,
      })
    ).toBe(true);
    expect(
      warmWouldStealProviderDownload({
        otherViewerActive: true,
        otherSourceComplete: null,
        otherFfmpegRunning: false,
      })
    ).toBe(false);
  });
});

describe("sameProviderDownloadSlot", () => {
  it("treats two episodes on the same login as one provider slot", () => {
    const a = "http://panel.example/series/user/pass/101.mkv";
    const b = "http://panel.example/series/user/pass/102.mkv";
    const other = "http://panel.example/series/other/pass/102.mkv";
    expect(sameProviderDownloadSlot(a, b)).toBe(true);
    expect(sameProviderDownloadSlot(a, other)).toBe(false);
  });
});
