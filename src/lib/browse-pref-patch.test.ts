import { describe, expect, it } from "vitest";
import { browsePrefPatchIsNoop } from "./browse-pref-patch";

describe("browsePrefPatchIsNoop", () => {
  it("is a no-op when every patched field already matches", () => {
    expect(
      browsePrefPatchIsNoop(
        { liveCategory: "all", liveView: "list" },
        { liveCategory: "all" }
      )
    ).toBe(true);
  });

  it("is not a no-op when a field would change", () => {
    expect(
      browsePrefPatchIsNoop({ liveCategory: "12" }, { liveCategory: "all" })
    ).toBe(false);
    expect(browsePrefPatchIsNoop(undefined, { liveCategory: "all" })).toBe(
      false
    );
  });
});
