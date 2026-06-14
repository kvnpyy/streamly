import { describe, expect, it } from "vitest";
import {
  buildNameSearchIndex,
  buildNameSearchIndexChunked,
  filterByNameQuery,
} from "@/lib/name-search-index";

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

  it("buildNameSearchIndexChunked matches sync index", async () => {
    const rows = Array.from({ length: 3_100 }, (_, i) => ({
      id: i,
      name: `Channel ${i}`,
    }));
    const sync = buildNameSearchIndex(rows, (r) => r.name);
    const chunked = await buildNameSearchIndexChunked(rows, (r) => r.name, 500);
    expect(chunked.nameLower).toEqual(sync.nameLower);
    expect(filterByNameQuery(chunked, "channel 420").map((r) => r.id)).toEqual([420]);
  });
});
