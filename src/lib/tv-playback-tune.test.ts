import { describe, expect, it } from "vitest";
import {
  isLivingRoomPlaybackClient,
  liveChannelFlipDebounceMs,
  tvDiscoveryEpgMaxScan,
  tvLiveSearchMaxScanChannels,
} from "@/lib/tv-playback-tune";

describe("tv-playback-tune", () => {
  it("detects Tizen TV user agents", () => {
    expect(
      isLivingRoomPlaybackClient(
        "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36"
      )
    ).toBe(true);
  });

  it("uses longer channel-flip debounce on TV", () => {
    const tv = liveChannelFlipDebounceMs(
      "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36"
    );
    const desktop = liveChannelFlipDebounceMs(
      "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0"
    );
    expect(tv).toBeGreaterThan(desktop);
  });

  it("caps home discovery EPG scan on TV", () => {
    expect(
      tvDiscoveryEpgMaxScan(
        "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36"
      )
    ).toBe(24);
    expect(tvDiscoveryEpgMaxScan("Mozilla/5.0 Chrome/120")).toBe(36);
  });

  it("caps live programme search scan on TV", () => {
    const ua = "Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)";
    expect(tvLiveSearchMaxScanChannels(ua)).toBe(48);
    expect(tvLiveSearchMaxScanChannels("Mozilla/5.0 Chrome/120")).toBe(120);
  });
});
