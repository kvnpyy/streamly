import { describe, expect, it } from "vitest";
import {
  shouldSkipTrendingShelfHintWait,
  trendingOnTvPlaceholderData,
  trendingOnTvQueryKey,
} from "./use-trending-on-tv";

describe("trendingOnTvPlaceholderData", () => {
  const sample = {
    enabled: true,
    tvRegion: "All" as const,
    tmdbCountry: "US",
    items: [],
  };

  it("reuses placeholder only for the same region", () => {
    const prevKey = ["trending-on-tv", "srv", "user", "All"] as const;
    expect(
      trendingOnTvPlaceholderData(sample, prevKey, "All")
    ).toBe(sample);
    expect(
      trendingOnTvPlaceholderData(sample, prevKey, "North America")
    ).toBeUndefined();
  });
});

describe("trendingOnTvQueryKey", () => {
  it("stays stable when only soft EPG hints would have changed", () => {
    const a = trendingOnTvQueryKey("srv", "user", "North America", [1, 2, 3]);
    const b = trendingOnTvQueryKey("srv", "user", "North America", [1, 2, 3]);
    expect(a).toEqual(b);
    expect(a).not.toContain("epg");
    expect(a.length).toBe(5);
  });

  it("caps priority ids so long recent lists do not thrash the key", () => {
    const ids = Array.from({ length: 20 }, (_, i) => i + 1);
    const key = trendingOnTvQueryKey("srv", "user", "All", ids);
    expect(key[4].split(",")).toHaveLength(8);
  });
});

describe("shouldSkipTrendingShelfHintWait", () => {
  it("skips wait when local cache or shelf hints are warm", () => {
    expect(
      shouldSkipTrendingShelfHintWait({
        localEpgTitleCount: 3,
        shelfHintCount: 0,
      })
    ).toBe(true);
    expect(
      shouldSkipTrendingShelfHintWait({
        localEpgTitleCount: 0,
        shelfHintCount: 5,
      })
    ).toBe(true);
  });

  it("waits when both sources are cold", () => {
    expect(
      shouldSkipTrendingShelfHintWait({
        localEpgTitleCount: 1,
        shelfHintCount: 1,
      })
    ).toBe(false);
  });
});
