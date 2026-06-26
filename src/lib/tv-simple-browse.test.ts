import { describe, expect, it } from "vitest";
import { filterLiveCategoriesForTvRegion } from "./tv-simple-browse";
import type { Category } from "./xtream-types";

const cats: Category[] = [
  { category_id: "1", category_name: "US | Entertainment", parent_id: 0 },
  { category_id: "2", category_name: "UK | Entertainment", parent_id: 0 },
  { category_id: "3", category_name: "Sports", parent_id: 0 },
];

describe("filterLiveCategoriesForTvRegion", () => {
  it("keeps generic categories for any region", () => {
    const na = filterLiveCategoriesForTvRegion(cats, "North America");
    expect(na.some((c) => c.category_name === "Sports")).toBe(true);
    expect(na.some((c) => c.category_name.startsWith("US"))).toBe(true);
    expect(na.some((c) => c.category_name.startsWith("UK"))).toBe(false);
  });

  it("returns all categories when region is All", () => {
    expect(filterLiveCategoriesForTvRegion(cats, "All")).toHaveLength(3);
  });
});
