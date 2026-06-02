import { describe, expect, it } from "vitest";
import { planFromProbeCodecs } from "./vod-transcode-plan";

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
