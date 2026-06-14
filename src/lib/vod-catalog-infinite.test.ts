import { describe, expect, it } from "vitest";
import { catalogItemsNextPageParam } from "@/lib/vod-catalog-infinite";
import type { VodItemsPage } from "@/lib/vod-catalog-items-server";

describe("catalogItemsNextPageParam", () => {
  it("returns next offset when more items exist", () => {
    const page: VodItemsPage = {
      items: Array.from({ length: 120 }, (_, i) => ({ stream_id: i + 1 }) as VodItemsPage["items"][0]),
      total: 250,
      offset: 0,
      limit: 120,
    };
    expect(catalogItemsNextPageParam(page)).toBe(120);
  });

  it("returns undefined when all items loaded", () => {
    const page: VodItemsPage = {
      items: [],
      total: 0,
      offset: 0,
      limit: 120,
    };
    expect(catalogItemsNextPageParam(page)).toBeUndefined();
  });

  it("returns undefined on last partial page", () => {
    const page: VodItemsPage = {
      items: Array.from({ length: 30 }, (_, i) => ({ stream_id: i + 1 }) as VodItemsPage["items"][0]),
      total: 150,
      offset: 120,
      limit: 120,
    };
    expect(catalogItemsNextPageParam(page)).toBeUndefined();
  });
});
