import { describe, expect, it } from "vitest";
import {
  fmp4HlsMuxArgs,
  formatHlsTime,
  keyframePlanForFrameRate,
  parseFrameRate,
  planFromProbeCodecs,
  shouldIdleStopFfmpeg,
  transcodeLibx264Args,
  transcodeScaleFilter,
} from "./vod-transcode-plan";

describe("planFromProbeCodecs", () => {
  it("re-encodes picture and audio even when the source is H.264 AAC", () => {
    expect(planFromProbeCodecs("h264", "aac").mode).toBe("transcode");
  });

  it("re-encodes when h264 + ac3", () => {
    expect(planFromProbeCodecs("h264", "ac3").mode).toBe("transcode");
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
    expect(args).toContain(
      "cabac=1:bframes=0:ref=1:8x8dct=0:open-gop=0:scenecut=0:keyint=96:min-keyint=96"
    );
    expect(args).toContain("ultrafast");
    expect(args.join(" ")).not.toContain("force_key_frames");
    const g = args.indexOf("-g");
    const params = args.indexOf("-x264-params");
    expect(params).toBeGreaterThan(g);
  });

  it("locks the output frame rate so the GOP matches the segment", () => {
    const args = transcodeLibx264Args({
      preset: "veryfast",
      maxHeight: 720,
      gop: 96,
      frameRate: "24000/1001",
    });
    expect(args).toContain("-r");
    expect(args).toContain("24000/1001");
    const g = args.indexOf("-g");
    const rate = args.indexOf("-r");
    expect(rate).toBeGreaterThan(-1);
    expect(g).toBeGreaterThan(rate);
  });
});

describe("keyframePlanForFrameRate", () => {
  it("cuts a 24fps segment on the keyframe", () => {
    const plan = keyframePlanForFrameRate(24, 4);
    expect(plan).toEqual({ gop: 96, frameRate: "24", hlsTimeSec: 4 });
    expect(formatHlsTime(plan.hlsTimeSec)).toBe("4");
  });

  it("keeps film rate exact so the segment is not a frame short", () => {
    const plan = keyframePlanForFrameRate(24000 / 1001, 4);
    expect(plan.frameRate).toBe("24000/1001");
    expect(plan.gop).toBe(96);
    expect(plan.hlsTimeSec).toBeCloseTo(4.004, 6);
    expect(formatHlsTime(plan.hlsTimeSec)).toBe("4.004");
  });

  it("uses 30fps keyframes for 30fps video", () => {
    const plan = keyframePlanForFrameRate(30, 4);
    expect(plan).toEqual({ gop: 120, frameRate: "30", hlsTimeSec: 4 });
  });

  it("falls back to 24fps when the probe has no rate", () => {
    expect(parseFrameRate("0/0")).toBeNull();
    expect(parseFrameRate("90000/1")).toBeNull();
    const plan = keyframePlanForFrameRate(null, 4);
    expect(plan.frameRate).toBe("24");
    expect(plan.gop).toBe(96);
  });
});

describe("fmp4HlsMuxArgs", () => {
  it("packages a continuous file without an edit list", () => {
    const args = fmp4HlsMuxArgs();
    expect(args).toContain("fmp4");
    expect(args).toContain("use_editlist=0");
    expect(args).toContain("init.mp4.next");
    expect(args.join(" ")).not.toContain("mpegts");
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
