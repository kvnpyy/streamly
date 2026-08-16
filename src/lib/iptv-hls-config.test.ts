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

  it("TV live stays in the buffered window and tolerates event playlist holes", () => {
    const cfg = buildIptvHlsJsConfig({
      isLive: true,
      mobileLike: true,
      livingRoomLike: true,
    });
    expect(cfg.liveSyncMode).toBe("buffered");
    expect(cfg.maxBufferHole).toBeGreaterThanOrEqual(1);
    expect(cfg.liveSyncDurationCount).toBeGreaterThanOrEqual(8);
    expect(cfg.backBufferLength).toBeLessThanOrEqual(40);
    expect(cfg.nudgeMaxRetry).toBeGreaterThanOrEqual(20);
  });
});
