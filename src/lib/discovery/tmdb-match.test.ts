import { describe, expect, it } from "vitest";
import {
  catalogTitleEntriesFromMovies,
  matchTmdbTrendingToCatalog,
} from "@/lib/discovery/tmdb-match";
import { normalizeDiscoveryTitle } from "@/lib/discovery/normalize-title";
import type { VodStream } from "@/lib/xtream-types";

describe("normalizeDiscoveryTitle", () => {
  it("strips US prefix and HD tags", () => {
    expect(normalizeDiscoveryTitle("US: Inception (2010) HD")).toBe(
      "inception 2010"
    );
  });
});

describe("matchTmdbTrendingToCatalog", () => {
  const movies: VodStream[] = [
    {
      num: 1,
      name: "Inception",
      year: "2010",
      stream_type: "movie",
      stream_id: 101,
      stream_icon: "",
      added: "1",
      category_id: "1",
    },
    {
      num: 2,
      name: "The Dark Knight",
      year: "2008",
      stream_type: "movie",
      stream_id: 102,
      stream_icon: "",
      added: "1",
      category_id: "1",
    },
  ];

  it("matches trending titles to catalog ids", () => {
    const catalog = catalogTitleEntriesFromMovies(movies, (m) => m.stream_id);
    const ids = matchTmdbTrendingToCatalog(
      [
        { tmdbId: 1, title: "Inception", year: "2010", popularity: 100 },
        { tmdbId: 2, title: "Interstellar", year: "2014", popularity: 90 },
      ],
      catalog
    );
    expect(ids).toEqual([101]);
  });
});
