import { describe, expect, it } from "vitest";
import {
  appendCatalogFallbacks,
  buildRegionalTrending,
  REGIONAL_TRENDING_MIN_ITEMS,
  shouldShowRegionalTrending,
  vodShelfToTrendingCards,
} from "@/lib/discovery/regional-trending";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import type { LiveStream } from "@/lib/xtream-types";

function liveEntry(id: number, name: string, programme: string, score: number): ScoredLiveEntry {
  const stream: LiveStream = {
    stream_id: id,
    name,
    stream_type: "live",
    stream_icon: "",
    epg_channel_id: "",
    added: "",
    category_id: "1",
    custom_sid: "",
    tv_archive: 0,
    direct_source: "",
    tv_archive_duration: 0,
  };
  return { stream, programmeTitle: programme, score };
}

describe("buildRegionalTrending", () => {
  it("merges vod and live with kind caps", () => {
    const movies = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      href: `/app/movies/${i + 1}`,
      title: `Movie ${i + 1}`,
    }));
    const series = Array.from({ length: 8 }, (_, i) => ({
      id: 100 + i,
      href: `/app/series/${100 + i}`,
      title: `Show ${i + 1}`,
    }));

    const items = buildRegionalTrending({
      region: "US",
      tmdbMovies: movies,
      tmdbSeries: series,
      tmdbMoviePopularity: movies.map((_, i) => 100 - i),
      tmdbSeriesPopularity: series.map((_, i) => 80 - i),
      sportsEvents: [liveEntry(1, "ESPN PPV", "UFC 310", 90)],
      onNow: [liveEntry(2, "TLC", "90 Day Fiancé", 70)],
      tonight: [liveEntry(3, "NBC", "Sunday Night Football", 60)],
      limit: 14,
    });

    expect(items.length).toBeGreaterThanOrEqual(REGIONAL_TRENDING_MIN_ITEMS);
    const kinds = new Set(items.map((c) => c.kind));
    expect(kinds.has("movie")).toBe(true);
    expect(kinds.has("live")).toBe(true);
    expect(items.filter((c) => c.kind === "live").length).toBeLessThanOrEqual(5);
  });

  it("dedupes the same live channel", () => {
    const entry = liveEntry(9, "Fight Net", "UFC Prelims", 88);
    const items = buildRegionalTrending({
      region: "US",
      tmdbMovies: [],
      tmdbSeries: [],
      tmdbMoviePopularity: [],
      tmdbSeriesPopularity: [],
      sportsEvents: [entry],
      onNow: [entry],
      tonight: [],
    });
    expect(items.filter((c) => c.key === "live:9")).toHaveLength(1);
  });

  it("prefers TMDB-on-TV entries over duplicate on-now rows", () => {
    const tmdbTv = liveEntry(4, "TLC US", "90 Day Fiancé", 95);
    const onNow = liveEntry(4, "TLC US", "90 Day Fiancé", 70);
    const items = buildRegionalTrending({
      region: "US",
      tmdbMovies: [],
      tmdbSeries: [],
      tmdbMoviePopularity: [],
      tmdbSeriesPopularity: [],
      sportsEvents: [],
      trendingOnTv: [tmdbTv],
      onNow: [onNow],
      tonight: [],
    });
    expect(items.filter((c) => c.key === "live:4")).toHaveLength(1);
    expect(items.find((c) => c.key === "live:4")?.reason).toBe("tmdb_on_tv");
  });
});

describe("appendCatalogFallbacks", () => {
  it("fills thin shelves for TV", () => {
    const base = vodShelfToTrendingCards(
      [{ id: 1, href: "/app/movies/1", title: "A" }],
      "movie",
      "catalog_top_movie",
      30
    );
    const merged = appendCatalogFallbacks([], base, 2, 6);
    expect(merged.length).toBe(1);
    const filled = appendCatalogFallbacks(
      [],
      [
        ...base,
        ...vodShelfToTrendingCards(
          [{ id: 2, href: "/app/movies/2", title: "B" }],
          "movie",
          "catalog_top_movie",
          28
        ),
      ],
      2,
      6
    );
    expect(filled.length).toBeGreaterThanOrEqual(2);
  });
});

describe("shouldShowRegionalTrending", () => {
  it("requires minimum items", () => {
    expect(shouldShowRegionalTrending([])).toBe(false);
    expect(shouldShowRegionalTrending([], 2)).toBe(false);
    expect(
      shouldShowRegionalTrending(
        Array.from({ length: REGIONAL_TRENDING_MIN_ITEMS }, (_, i) => ({
          key: `m:${i}`,
          kind: "movie" as const,
          title: "x",
          signal: "y",
          reason: "tmdb_movie" as const,
          score: 1,
        }))
      )
    ).toBe(true);
  });
});
