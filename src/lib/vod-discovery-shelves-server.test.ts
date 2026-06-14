import { describe, expect, it } from "vitest";
import {
  buildSeriesDiscoveryShelvesPayload,
  buildVodDiscoveryShelvesPayload,
} from "@/lib/vod-discovery-shelves-server";
import type { SeriesCatalogBundle, VodCatalogBundle } from "@/lib/vod-catalog-bundle";

const vodBundle: VodCatalogBundle = {
  categories: [
    { category_id: "10", category_name: "Action", parent_id: 0 },
    { category_id: "20", category_name: "Comedy", parent_id: 0 },
  ],
  streams: [
    {
      stream_id: 501,
      num: 1,
      name: "Alpha Action",
      category_id: "10",
      stream_icon: "",
      rating: "8.5",
      year: "2024",
      added: "1700000100",
      stream_type: "movie",
    },
    {
      stream_id: 502,
      num: 2,
      name: "Beta Blast",
      category_id: "10",
      stream_icon: "",
      rating: "7.0",
      year: "2023",
      added: "1700000200",
      stream_type: "movie",
    },
    {
      stream_id: 503,
      num: 3,
      name: "Comedy Night",
      category_id: "20",
      stream_icon: "",
      rating: "6.5",
      year: "2022",
      added: "1700000300",
      stream_type: "movie",
    },
  ],
  countByCategoryId: { "10": 2, "20": 1 },
  idsByCategory: { "10": [501, 502], "20": [503] },
};

const seriesBundle: SeriesCatalogBundle = {
  categories: [{ category_id: "5", category_name: "Drama", parent_id: 0 }],
  streams: [
    {
      series_id: 901,
      num: 1,
      name: "Drama One",
      category_id: "5",
      cover: "",
      rating: "9.0",
      year: "2024",
      last_modified: "1700000100",
    },
    {
      series_id: 902,
      num: 2,
      name: "Drama Two",
      category_id: "5",
      cover: "",
      rating: "8.0",
      year: "2023",
      last_modified: "1700000200",
    },
  ],
  countByCategoryId: { "5": 2 },
  idsByCategory: { "5": [901, 902] },
};

const baseOpts = {
  hideAdult: false,
  parentalUnlocked: false,
  recentIds: [] as number[],
  favoriteIds: [] as number[],
  movieTrending: [] as { id: number; title: string; media_type: string }[],
  tvTrending: [] as { id: number; title: string; media_type: string }[],
};

describe("buildVodDiscoveryShelvesPayload", () => {
  it("returns top rated sorted by rating", () => {
    const payload = buildVodDiscoveryShelvesPayload(vodBundle, baseOpts);
    expect(payload.topRated.map((x) => x.id)).toEqual([501, 502, 503]);
    expect(payload.topRated[0]?.title).toBe("Alpha Action");
  });

  it("returns newly added sorted by added timestamp", () => {
    const payload = buildVodDiscoveryShelvesPayload(vodBundle, baseOpts);
    expect(payload.newlyAdded.map((x) => x.id)).toEqual([503, 502, 501]);
  });

  it("builds for-you from recent ids", () => {
    const payload = buildVodDiscoveryShelvesPayload(vodBundle, {
      ...baseOpts,
      recentIds: [503, 501],
    });
    expect(payload.forYou.map((x) => x.id)).toEqual([503, 501]);
  });
});

describe("buildSeriesDiscoveryShelvesPayload", () => {
  it("returns top rated series", () => {
    const payload = buildSeriesDiscoveryShelvesPayload(seriesBundle, baseOpts);
    expect(payload.topRated.map((x) => x.id)).toEqual([901, 902]);
  });
});
