import { describe, expect, it } from "vitest";
import { toSlimVodCatalog } from "@/lib/slim-vod-catalog";
import {
  listSeriesItemsFromBundle,
  listVodItemsFromBundle,
} from "@/lib/vod-catalog-items-server";
import {
  seriesItemByIdMap,
  vodStreamByIdMap,
} from "@/lib/vod-catalog-stream-map";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";
import type { SeriesCatalogBundle, VodCatalogBundle } from "@/lib/vod-catalog-bundle";

const vodStreams: VodStream[] = [
  {
    stream_id: 1,
    name: "Alpha Movie",
    category_id: "10",
    stream_icon: "",
    rating: "8.5",
  },
  {
    stream_id: 2,
    name: "Beta Film",
    category_id: "10",
    stream_icon: "",
    rating: "6.0",
  },
  {
    stream_id: 3,
    name: "Gamma",
    category_id: "20",
    stream_icon: "",
    rating: "9.0",
  },
  {
    stream_id: 4,
    name: "EN - English Title",
    category_id: "10",
    stream_icon: "",
    rating: "7.0",
  },
  {
    stream_id: 5,
    name: "FR - French Title",
    category_id: "10",
    stream_icon: "",
    rating: "7.5",
  },
];

const vodBundle: VodCatalogBundle = {
  categories: [
    { category_id: "10", category_name: "Action", parent_id: 0 },
    { category_id: "20", category_name: "Drama", parent_id: 0 },
  ],
  streams: vodStreams,
  countByCategoryId: { "10": 4, "20": 1 },
  idsByCategory: { "10": [1, 2, 4, 5], "20": [3] },
};

describe("toSlimVodCatalog", () => {
  it("strips streams and keeps counts", () => {
    const slim = toSlimVodCatalog(vodBundle);
    expect(slim.categories).toHaveLength(2);
    expect(slim.countByCategoryId).toEqual({ "10": 4, "20": 1 });
    expect(slim.languages).toEqual(["EN", "FR"]);
    expect("streams" in slim).toBe(false);
  });
});

describe("listVodItemsFromBundle", () => {
  const byId = vodStreamByIdMap(vodStreams);

  it("pages by category", () => {
    const page = listVodItemsFromBundle(vodBundle, byId, {
      categoryId: "10",
      offset: 0,
      limit: 10,
    });
    expect(page.total).toBe(4);
    expect(page.items.map((m) => m.stream_id)).toEqual([1, 2, 4, 5]);
  });

  it("filters by language server-side", () => {
    const page = listVodItemsFromBundle(vodBundle, byId, {
      categoryId: "all",
      lang: "EN",
      limit: 10,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]?.name).toBe("EN - English Title");
  });

  it("filters by query server-side", () => {
    const page = listVodItemsFromBundle(vodBundle, byId, {
      categoryId: "all",
      q: "beta",
      limit: 10,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]?.name).toBe("Beta Film");
  });

  it("sorts by rating", () => {
    const page = listVodItemsFromBundle(vodBundle, byId, {
      categoryId: "all",
      sort: "rating",
      limit: 10,
    });
    expect(page.items.map((m) => m.stream_id)).toEqual([3, 1, 5, 4, 2]);
  });

  it("materializes explicit ids", () => {
    const page = listVodItemsFromBundle(vodBundle, byId, {
      streamIds: [2, 1],
      limit: 10,
    });
    expect(page.items.map((m) => m.stream_id)).toEqual([2, 1]);
  });
});

describe("listSeriesItemsFromBundle", () => {
  const seriesStreams: SeriesItem[] = [
    {
      series_id: 100,
      name: "Show A",
      category_id: "5",
      cover: "",
      rating: "7",
    },
    {
      series_id: 101,
      name: "Show B",
      category_id: "5",
      cover: "",
      rating: "9",
    },
  ];
  const bundle: SeriesCatalogBundle = {
    categories: [{ category_id: "5", category_name: "TV", parent_id: 0 }],
    streams: seriesStreams,
    countByCategoryId: { "5": 2 },
    idsByCategory: { "5": [100, 101] },
  };
  const byId = seriesItemByIdMap(seriesStreams);

  it("returns series page sorted by rating", () => {
    const page = listSeriesItemsFromBundle(bundle, byId, {
      categoryId: "5",
      sort: "rating",
      limit: 10,
    });
    expect(page.items.map((s) => s.series_id)).toEqual([101, 100]);
  });
});
