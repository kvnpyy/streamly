import { describe, expect, it } from "vitest";
import { transcodeManifestWaitMs } from "@/lib/vod-transcode-wait";

describe("transcodeManifestWaitMs", () => {
  it("uses short HTTP wait for start-of-file playback", () => {
    expect(transcodeManifestWaitMs(0)).toBe(16_000);
  });

  it("uses full playlist wait for mid-file seeks", () => {
    expect(transcodeManifestWaitMs(1800)).toBe(120_000);
  });
});
