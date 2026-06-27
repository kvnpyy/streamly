import { describe, expect, it } from "vitest";

/** Mirrors CategoryPicker list remount key — filter text must not reset scroll while typing. */
function categoryPickerListKey(
  value: string | "all",
  entryIds: Array<string | "all">
): string {
  const entryKeys = entryIds.join("\u001f");
  return `${value}\u0000${entryKeys}`;
}

describe("categoryPickerListKey", () => {
  it("does not change when filter text changes but entries are unchanged", () => {
    const entries = ["all", "1", "2", "3"] as const;
    const before = categoryPickerListKey("all", [...entries]);
    const after = categoryPickerListKey("all", [...entries]);
    expect(before).toBe(after);
  });

  it("changes when filtered entries change", () => {
    const all = categoryPickerListKey("all", ["all", "1", "2"]);
    const narrowed = categoryPickerListKey("all", ["all", "1"]);
    expect(all).not.toBe(narrowed);
  });
});
