import { describe, expect, it } from "vitest";
import {
  buildAppleMobileLiveHlsConfig,
  buildIptvHlsJsConfig,
} from "@/lib/iptv-hls-config";

describe("buildIptvHlsJsConfig live IPTV smoothness", () => {
  it("never speeds up playback to chase the live edge", () => {
    const cases = [
      buildIptvHlsJsConfig({ isLive: true, mobileLike: false, chromiumDesktop: true }),
      buildIptvHlsJsConfig({ isLive: true, mobileLike: false, chromiumDesktop: false }),
      buildIptvHlsJsConfig({ isLive: true, mobileLike: true }),
      buildIptvHlsJsConfig({ isLive: true, mobileLike: true, livingRoomLike: true }),
      buildIptvHlsJsConfig({ isLive: true, mobileLike: true, silkLike: true }),
    ];
    for (const cfg of cases) {
      expect(cfg.maxLiveSyncPlaybackRate).toBe(1);
      expect(cfg.liveSyncOnStallIncrease).toBe(0);
      expect(cfg.liveMaxLatencyDurationCount).toBeGreaterThanOrEqual(8);
    }
  });

  it("apple mobile live override stays at playback rate 1", () => {
    const cfg = buildAppleMobileLiveHlsConfig();
    expect(cfg.maxLiveSyncPlaybackRate).toBe(1);
    expect(cfg.liveSyncOnStallIncrease).toBe(0);
  });

  it("TV live does not skip large holes or chase a buffered live edge", () => {
    const cfg = buildIptvHlsJsConfig({
      isLive: true,
      mobileLike: true,
      livingRoomLike: true,
    });
    expect(cfg.liveSyncMode).toBeUndefined();
    expect(cfg.maxBufferHole).toBeLessThan(1);
    expect(cfg.maxLiveSyncPlaybackRate).toBe(1);
    expect(cfg.liveSyncOnStallIncrease).toBe(0);
  });
});
