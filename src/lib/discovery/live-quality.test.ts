import { describe, expect, it } from "vitest";
import { isSpamLiveListing } from "@/lib/discovery/live-quality";

describe("isSpamLiveListing", () => {
  it("flags PPV placeholder listings", () => {
    expect(
      isSpamLiveListing(
        "- NO EVENT STREAMING - | 8K EXCLUSIVE | SE: MAX PPV 100",
        "NO EVENT STREAMING"
      )
    ).toBe(true);
  });

  it("allows normal channels", () => {
    expect(isSpamLiveListing("US: HBO East", "Game of Thrones")).toBe(false);
  });
});
