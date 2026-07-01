import { describe, expect, it } from "vitest";
import { filterDiscoveryShelfItems } from "@/lib/vod-discovery-shelf-filter";
import type { VodDiscoveryShelfItemDto } from "@/lib/vod-discovery-shelves-types";

const items: VodDiscoveryShelfItemDto[] = [
  {
    id: 1,
    href: "/app/movies/1",
    title: "EN | Action Hero",
    categoryId: "10",
  },
  {
    id: 2,
    href: "/app/movies/2",
    title: "FR | Comedy Night",
    categoryId: "20",
  },
  {
    id: 3,
    href: "/app/movies/3",
    title: "EN | Space Quest",
    categoryId: "10",
  },
];

describe("filterDiscoveryShelfItems", () => {
  it("returns all items when no filters are active", () => {
    expect(filterDiscoveryShelfItems(items, { categoryId: "all" })).toEqual(
      items
    );
  });

  it("filters by category without changing shelf order", () => {
    expect(
      filterDiscoveryShelfItems(items, { categoryId: "10" }).map((x) => x.id)
    ).toEqual([1, 3]);
  });

  it("uses shelf category when item category is missing", () => {
    const loose = [
      { id: 1, href: "/app/movies/1", title: "Mystery Box" },
    ];
    expect(
      filterDiscoveryShelfItems(loose, { categoryId: "10" }, {
        shelfCategoryId: "20",
      })
    ).toEqual([]);
  });

  it("filters by search query on title", () => {
    expect(
      filterDiscoveryShelfItems(items, { q: "space" }).map((x) => x.id)
    ).toEqual([3]);
  });

  it("filters by language using title prefix", () => {
    expect(
      filterDiscoveryShelfItems(items, { lang: "FR" }).map((x) => x.id)
    ).toEqual([2]);
  });
});
