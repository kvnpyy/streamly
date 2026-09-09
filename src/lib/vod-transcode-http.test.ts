import { describe, expect, it } from "vitest";
import { isRetryableVodTranscodeHttpStatus } from "@/lib/vod-transcode-http";

describe("isRetryableVodTranscodeHttpStatus", () => {
  it("retries Cloudflare 524 and other gateway / still-encoding statuses", () => {
    expect(isRetryableVodTranscodeHttpStatus(503)).toBe(true);
    expect(isRetryableVodTranscodeHttpStatus(504)).toBe(true);
    expect(isRetryableVodTranscodeHttpStatus(524)).toBe(true);
  });

  it("does not retry hard failures", () => {
    expect(isRetryableVodTranscodeHttpStatus(404)).toBe(false);
    expect(isRetryableVodTranscodeHttpStatus(403)).toBe(false);
    expect(isRetryableVodTranscodeHttpStatus(200)).toBe(false);
  });
});
