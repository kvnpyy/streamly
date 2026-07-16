import { describe, expect, it } from "vitest";
import { buildVodTranscodeHlsJsConfig } from "@/lib/iptv-hls-config";

describe("buildVodTranscodeHlsJsConfig", () => {
  it("buffers behind the encode edge and avoids stretchShortVideoTrack", () => {
    const cfg = buildVodTranscodeHlsJsConfig();
    expect(cfg.stretchShortVideoTrack).toBe(false);
    expect(cfg.maxLiveSyncPlaybackRate).toBe(1);
    expect(cfg.liveSyncDurationCount).toBeGreaterThanOrEqual(3);
    expect(cfg.liveMaxLatencyDurationCount).toBeGreaterThanOrEqual(6);
    expect(cfg.maxBufferHole).toBeLessThanOrEqual(0.35);
    expect(cfg.liveSyncMode).toBe("buffered");
    expect(cfg.maxBufferLength).toBeGreaterThanOrEqual(32);
    expect(cfg.startFragPrefetch).toBe(true);
    expect(cfg.initialLiveManifestSize).toBe(1);
    // hls.js throws if count- and duration-based live sync are mixed.
    expect(cfg.liveSyncDuration).toBeUndefined();
    expect(cfg.liveMaxLatencyDuration).toBeUndefined();
  });
});
