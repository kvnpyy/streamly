import { describe, expect, it } from "vitest";
import {
  isLiveDiscoveryEpgNetworkEnabled,
  isLiveGuideEpgEnabled,
  isLiveProgrammeSearchEnabled,
  isLiveShelfEpgEnabled,
  isLiveTileEpgEnabled,
  isLiveTrendingShelfEnabled,
  isLiveTrendingEpgNetworkEnabled,
} from "@/lib/live-epg-policy";

describe("live-epg-policy", () => {
  it("disables heavy discovery scans by default", () => {
    expect(isLiveDiscoveryEpgNetworkEnabled()).toBe(false);
    expect(isLiveProgrammeSearchEnabled()).toBe(false);
    expect(isLiveGuideEpgEnabled()).toBe(false);
  });

  it("enables tile and shelf EPG by default", () => {
    expect(isLiveTileEpgEnabled()).toBe(true);
    expect(isLiveShelfEpgEnabled()).toBe(true);
  });

  it("enables trending on TV shelf when discovery shelves default on", () => {
    expect(isLiveTrendingShelfEnabled()).toBe(true);
  });

  it("keeps client trending EPG off by default (server API handles it)", () => {
    expect(isLiveTrendingEpgNetworkEnabled()).toBe(false);
  });
});
