import { describe, expect, it } from "vitest";
import { trendingOnTvPlaceholderData } from "./use-trending-on-tv";

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
