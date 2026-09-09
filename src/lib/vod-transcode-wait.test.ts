import { describe, expect, it } from "vitest";
import { transcodeManifestWaitMs } from "@/lib/vod-transcode-wait";

describe("transcodeManifestWaitMs", () => {
  it("caps every request well under Cloudflare’s 524 timeout", () => {
    expect(transcodeManifestWaitMs(0)).toBe(16_000);
    expect(transcodeManifestWaitMs(2914)).toBe(16_000);
    expect(transcodeManifestWaitMs(1800, { playlistWaitMs: 120_000 })).toBe(
      16_000
    );
  });

  it("honors a shorter explicit HTTP wait", () => {
    expect(transcodeManifestWaitMs(0, { httpWaitMs: 8_000 })).toBe(8_000);
  });
});
