import { describe, expect, it } from "vitest";
import { getShelfCategoriesForRegion } from "./live-catalog-shelf-category-cache";
import type { Category } from "./xtream-types";

describe("getShelfCategoriesForRegion", () => {
  it("returns North America browse order (CA and 24/7 before bulk US rows)", () => {
    const categories: Category[] = [
      { category_id: "1", category_name: "[US] USA GENERAL" },
      { category_id: "2", category_name: "[US] USA NEWS" },
      { category_id: "3", category_name: "[US] 24/7 ENGLISH MOVIES" },
      { category_id: "4", category_name: "[CA] CANADA" },
    ];
    const counts = { "1": 10, "2": 8, "3": 50, "4": 20 };
    const index = {
      "1": [1],
      "2": [2],
      "3": [3],
      "4": [4],
    };

    const sorted = getShelfCategoriesForRegion(
      "test-disk-key",
      "North America",
      categories,
      counts,
      index
    );

    expect(sorted.map((c) => c.category_name)).toEqual([
      "[CA] CANADA",
      "[US] 24/7 ENGLISH MOVIES",
      "[US] USA GENERAL",
      "[US] USA NEWS",
    ]);
  });
});
