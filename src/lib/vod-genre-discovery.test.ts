import { describe, expect, it } from "vitest";
import { pickGenreCategories } from "./vod-genre-discovery";
import type { Category } from "@/lib/xtream-types";

function cat(id: string, name: string): Category {
  return { category_id: id, category_name: name, parent_id: 0 };
}

describe("pickGenreCategories", () => {
  it("prioritizes named genres and requires minimum count", () => {
    const categories = [
      cat("1", "Misc"),
      cat("2", "Horror"),
      cat("3", "Comedy"),
      cat("4", "Empty"),
    ];
    const countById = { "1": 20, "2": 12, "3": 8, "4": 1 };
    const picked = pickGenreCategories(categories, countById, { max: 3 });
    expect(picked.map((c) => c.category_name)).toEqual([
      "Comedy",
      "Horror",
      "Misc",
    ]);
  });
});
