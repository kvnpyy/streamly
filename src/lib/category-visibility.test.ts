import { describe, expect, it } from "vitest";
import type { Category } from "@/lib/xtream-types";
import {
  filterCategoriesByVisibility,
  getVisibleCategoryIds,
  normalizeVisibleCategoryIds,
} from "@/lib/category-visibility";

const cats: Category[] = [
  { category_id: "1", category_name: "News" },
  { category_id: "2", category_name: "Sports" },
  { category_id: "3", category_name: "Movies" },
];

describe("normalizeVisibleCategoryIds", () => {
  it("treats empty as show-all", () => {
    expect(normalizeVisibleCategoryIds(undefined)).toBeUndefined();
    expect(normalizeVisibleCategoryIds([])).toBeUndefined();
    expect(normalizeVisibleCategoryIds(null)).toBeUndefined();
  });

  it("dedupes and stringifies", () => {
    expect(normalizeVisibleCategoryIds(["2", 2, "1", ""])).toEqual(["2", "1"]);
  });
});

describe("filterCategoriesByVisibility", () => {
  it("returns all when no filter", () => {
    expect(filterCategoriesByVisibility(cats, undefined)).toEqual(cats);
    expect(filterCategoriesByVisibility(cats, [])).toEqual(cats);
  });

  it("keeps only selected ids in original order", () => {
    expect(
      filterCategoriesByVisibility(cats, ["3", "1"]).map((c) => c.category_id)
    ).toEqual(["1", "3"]);
  });
});

describe("getVisibleCategoryIds", () => {
  it("reads the matching browse pref", () => {
    expect(
      getVisibleCategoryIds(
        { moviesVisibleCategoryIds: ["10", "20"] },
        "movies"
      )
    ).toEqual(["10", "20"]);
    expect(getVisibleCategoryIds({ liveVisibleCategoryIds: [] }, "live")).toBeUndefined();
  });
});
