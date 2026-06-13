import { describe, expect, it } from "vitest";
import { transcodeManifestWaitMs } from "@/lib/vod-transcode-wait";

describe("transcodeManifestWaitMs", () => {
  it("uses extended wait for start-of-file playback", () => {
    expect(transcodeManifestWaitMs(0)).toBe(60_000);
    expect(transcodeManifestWaitMs(0, { httpWaitMs: 30_000 })).toBe(60_000);
  });

  it("uses full playlist wait for mid-file seeks", () => {
    expect(transcodeManifestWaitMs(1800)).toBe(120_000);
  });
});
