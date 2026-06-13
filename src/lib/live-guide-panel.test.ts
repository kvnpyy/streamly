import { describe, expect, it } from "vitest";
import { LIVE_GUIDE_MAX_CHANNELS } from "@/lib/live-guide-limits";

/** Mirror LiveGuidePanel channel cap logic for regression tests. */
function guideChannelLimit(
  allCategoriesMode: boolean,
  livingRoomGuide: boolean
): number {
  return allCategoriesMode
    ? Math.min(LIVE_GUIDE_MAX_CHANNELS, livingRoomGuide ? 36 : 48)
    : LIVE_GUIDE_MAX_CHANNELS;
}

describe("LiveGuidePanel limits", () => {
  it("uses a tighter cap on living-room guide (all categories)", () => {
    expect(guideChannelLimit(true, true)).toBe(36);
    expect(guideChannelLimit(true, false)).toBe(48);
  });

  it("uses full guide max when a single category is selected", () => {
    expect(guideChannelLimit(false, true)).toBe(LIVE_GUIDE_MAX_CHANNELS);
  });
});
