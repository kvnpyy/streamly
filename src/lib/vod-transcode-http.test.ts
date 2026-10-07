import { describe, expect, it } from "vitest";
import {
  isRetryableVodTranscodeHttpStatus,
  VOD_SEGMENT_READY_WAIT_MS,
  vodTranscodeFragShouldRetryInPlace,
} from "@/lib/vod-transcode-http";

describe("isRetryableVodTranscodeHttpStatus", () => {
  it("retries Cloudflare 524 and other gateway / still-encoding statuses", () => {
    expect(isRetryableVodTranscodeHttpStatus(502)).toBe(true);
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

describe("vodTranscodeFragShouldRetryInPlace", () => {
  it("retries a socket reset the same way as a gateway timeout", () => {
    expect(
      vodTranscodeFragShouldRetryInPlace({
        details: "fragLoadError",
        httpStatus: 0,
      })
    ).toBe(true);
    expect(
      vodTranscodeFragShouldRetryInPlace({
        details: "fragLoadError",
        httpStatus: 503,
      })
    ).toBe(true);
  });

  it("does not swallow a real missing-file response", () => {
    expect(
      vodTranscodeFragShouldRetryInPlace({
        details: "fragLoadError",
        httpStatus: 404,
      })
    ).toBe(false);
  });

  it("stays inside the proxy cutoff", () => {
    expect(VOD_SEGMENT_READY_WAIT_MS).toBeLessThan(90_000);
  });
});
