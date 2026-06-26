import { describe, expect, it } from "vitest";
import { buildLiveGuideLayout } from "@/lib/live-guide-layout";

describe("buildLiveGuideLayout", () => {
  it("uses larger rows and channel column on living room", () => {
    const desktop = buildLiveGuideLayout(false, false);
    const living = buildLiveGuideLayout(true, false);
    expect(living.rowPx).toBeGreaterThan(desktop.rowPx);
    expect(living.channelColPx).toBeGreaterThan(desktop.channelColPx);
    expect(living.pxPerMin).toBeGreaterThan(desktop.pxPerMin);
  });

  it("uses compact phone layout when landscape phone", () => {
    const phone = buildLiveGuideLayout(false, true);
    expect(phone.rowPx).toBeLessThan(buildLiveGuideLayout(false, false).rowPx);
  });
});
