import { describe, expect, it } from "vitest";
import {
  buildIdsByCategory,
  buildItemByIdMap,
  pickItemsForCategory,
} from "./vod-catalog-index";

type Row = { id: number; category_id: string };

describe("vod-catalog-index", () => {
  const rows: Row[] = [
    { id: 1, category_id: "10" },
    { id: 2, category_id: "10" },
    { id: 3, category_id: "20" },
  ];

  it("picks by category in O(category)", () => {
    const idsByCategory = buildIdsByCategory(
      rows,
      (r) => r.category_id,
      (r) => r.id
    );
    const byId = buildItemByIdMap(rows, (r) => r.id);
    const picked = pickItemsForCategory(rows, "10", idsByCategory, byId);
    expect(picked.map((r) => r.id)).toEqual([1, 2]);
  });
});
