import type { BrowsePrefs } from "@/store/preferences";
import type { Category } from "@/lib/xtream-types";
import { describe, expect, it } from "vitest";
import { orderedLiveCategories } from "@/lib/live-category-sort";

const mk = (id: string, name: string): Category => ({
  category_id: id,
  category_name: name,
  parent_id: 0,
});

describe("orderedLiveCategories", () => {
  const raw = [mk("3", "Zebra"), mk("1", "Alpha"), mk("2", "Beta")];

  it("returns provider copy by default / provider mode", () => {
    const out = orderedLiveCategories(raw, {});
    expect(out.map((c) => c.category_id)).toEqual(["3", "1", "2"]);
  });

  it("sorts A–Z when mode az", () => {
    const prefs: BrowsePrefs = { liveCategorySortMode: "az" };
    const out = orderedLiveCategories(raw, prefs).map((c) => c.category_name);
    expect(out).toEqual(["Alpha", "Beta", "Zebra"]);
  });

  it("manual: honors order then appends leftovers sorted", () => {
    const prefs: BrowsePrefs = {
      liveCategorySortMode: "manual",
      liveCategoryManualOrder: ["2", "1"],
    };
    expect(orderedLiveCategories(raw, prefs).map((c) => c.category_id)).toEqual([
      "2",
      "1",
      "3",
    ]);
  });
});
