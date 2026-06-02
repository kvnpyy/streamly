import { describe, expect, it } from "vitest";
import { buildShelfCategoryListChunked } from "./live-shelf-category-list";
import type { Category } from "@/lib/xtream-types";

function cat(id: string, name: string): Category {
  return {
    category_id: id,
    category_name: name,
    parent_id: 0,
  };
}

describe("buildShelfCategoryListChunked", () => {
  it("keeps categories with streams that pass the region gate", async () => {
    const categories = [
      cat("1", "USA | Entertainment"),
      cat("2", "UK | News"),
      cat("3", "Empty"),
    ];
    const idsByCategory: Record<string, number[]> = {
      "1": [1],
      "2": [2],
      "3": [],
    };
    const list = await buildShelfCategoryListChunked({
      categories,
      idsByCategory,
      region: "North America",
      isStale: () => false,
    });
    expect(list.map((c) => c.category_id)).toEqual(["1"]);
  });

  it("stops when isStale becomes true", async () => {
    const categories = Array.from({ length: 120 }, (_, i) =>
      cat(String(i), `USA | Cat ${i}`)
    );
    const idsByCategory: Record<string, number[]> = {};
    for (const c of categories) {
      idsByCategory[c.category_id] = [1];
    }
    let stale = false;
    const promise = buildShelfCategoryListChunked({
      categories,
      idsByCategory,
      region: "All",
      isStale: () => stale,
    });
    stale = true;
    const list = await promise;
    expect(list.length).toBeLessThan(120);
  });
});
