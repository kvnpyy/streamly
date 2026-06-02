import { describe, expect, it } from "vitest";
import {
  isLiveDiscoveryEpgNetworkEnabled,
  isLiveGuideEpgEnabled,
  isLiveProgrammeSearchEnabled,
} from "@/lib/live-epg-policy";

describe("live-epg-policy", () => {
  it("disables background EPG by default", () => {
    expect(isLiveDiscoveryEpgNetworkEnabled()).toBe(false);
    expect(isLiveProgrammeSearchEnabled()).toBe(false);
    expect(isLiveGuideEpgEnabled()).toBe(false);
  });
});
