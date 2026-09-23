import { describe, expect, it } from "vitest";
import {
  planFromProbeCodecs,
  shouldIdleStopFfmpeg,
  transcodeLibx264Args,
  transcodeScaleFilter,
} from "./vod-transcode-plan";

describe("planFromProbeCodecs", () => {
  it("copy when h264 + aac", () => {
    expect(planFromProbeCodecs("h264", "aac").mode).toBe("copy");
  });

  it("copyVideo when h264 + ac3", () => {
    expect(planFromProbeCodecs("h264", "ac3").mode).toBe("copyVideo");
  });

  it("transcode for hevc", () => {
    expect(planFromProbeCodecs("hevc", "aac").mode).toBe("transcode");
  });
});

describe("transcodeScaleFilter", () => {
  it("caps height, not width, and 16-aligns", () => {
    const vf = transcodeScaleFilter(540);
    expect(vf).toContain("min(540,ih)");
    expect(vf).not.toContain("min(540,iw)");
    expect(vf).toContain("force_divisible_by=16");
    expect(vf).toContain("format=yuv420p");
  });
});

describe("transcodeLibx264Args", () => {
  it("forces Main profile over the ultrafast Baseline default", () => {
    const args = transcodeLibx264Args({
      preset: "ultrafast",
      maxHeight: 540,
      gop: 96,
    });
    expect(args).toContain("main");
    expect(args).toContain("cabac=1:bframes=0:ref=1:8x8dct=0");
    expect(args).toContain("ultrafast");
    expect(args.join(" ")).not.toContain("force_key_frames");
  });
});

describe("shouldIdleStopFfmpeg", () => {
  it("keeps incomplete encodes running after the viewer pauses", () => {
    expect(
      shouldIdleStopFfmpeg({
        viewerActive: false,
        ffmpegRunning: true,
        playlistComplete: false,
      })
    ).toBe(false);
  });

  it("stops a finished encode with no viewer", () => {
    expect(
      shouldIdleStopFfmpeg({
        viewerActive: false,
        ffmpegRunning: true,
        playlistComplete: true,
      })
    ).toBe(true);
  });
});
