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

  it("TV live never seeks to catch the live edge or nudge over holes", () => {
    const cfg = buildIptvHlsJsConfig({
      isLive: true,
      mobileLike: true,
      livingRoomLike: true,
    });
    expect(cfg.liveSyncMode).toBeUndefined();
    expect(cfg.liveMaxLatencyDurationCount).toBe(Infinity);
    expect(cfg.nudgeMaxRetry).toBe(0);
    expect(cfg.maxBufferHole).toBeLessThanOrEqual(0.2);
    expect(cfg.maxLiveSyncPlaybackRate).toBe(1);
    expect(cfg.liveSyncOnStallIncrease).toBe(0);
  });

  it("desktop live does not cap quality to the player box", () => {
    const desktop = buildIptvHlsJsConfig({
      isLive: true,
      mobileLike: false,
      chromiumDesktop: true,
    });
    expect(desktop.capLevelToPlayerSize).toBe(false);
    expect(desktop.enableCEA708Captions).toBe(true);
    expect(desktop.abrBandWidthUpFactor).toBeGreaterThanOrEqual(0.4);

    const phone = buildIptvHlsJsConfig({
      isLive: true,
      mobileLike: true,
    });
    expect(phone.capLevelToPlayerSize).toBe(true);
  });
});
