import { describe, expect, it } from "vitest";
import { buildVodTranscodeHlsJsConfig } from "@/lib/iptv-hls-config";

describe("buildVodTranscodeHlsJsConfig", () => {
  it("buffers behind the encode edge and avoids stretchShortVideoTrack", () => {
    const cfg = buildVodTranscodeHlsJsConfig();
    expect(cfg.stretchShortVideoTrack).toBe(false);
    expect(cfg.maxLiveSyncPlaybackRate).toBe(1);
    expect(cfg.liveSyncDurationCount).toBeGreaterThanOrEqual(3);
    expect(cfg.liveMaxLatencyDurationCount).toBe(Number.POSITIVE_INFINITY);
    expect(cfg.liveSyncMode).toBe("buffered");
    expect(cfg.maxBufferLength).toBeGreaterThanOrEqual(20);
    // hls.js throws if count- and duration-based live sync are mixed.
    expect(cfg.liveSyncDuration).toBeUndefined();
    expect(cfg.liveMaxLatencyDuration).toBeUndefined();
  });
});
