import { describe, expect, it } from "vitest";
import { buildNameSearchIndex, filterByNameQuery } from "@/lib/name-search-index";

describe("name-search-index", () => {
  it("filters by precomputed lowercase names", () => {
    const index = buildNameSearchIndex(
      [
        { id: 1, name: "CNN" },
        { id: 2, name: "BBC News" },
      ],
      (r) => r.name
    );
    expect(filterByNameQuery(index, "bbc").map((r) => r.id)).toEqual([2]);
  });
});
