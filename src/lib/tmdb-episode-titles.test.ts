import { describe, expect, it } from "vitest";
import {
  displayEpisodeTitle,
  lookupEpisodeTitle,
  pickTvSeriesId,
  seriesExternalIds,
} from "./tmdb-episode-titles";

describe("series episode titles", () => {
  it("reads a provider tmdb id", () => {
    expect(seriesExternalIds({ tmdb_id: "1396" })).toEqual({
      tmdbId: "1396",
      imdbId: null,
    });
    expect(seriesExternalIds({ imdb: "tt0141842" }).imdbId).toBe("tt0141842");
  });

  it("does not pick a same-name show from another year", () => {
    const id = pickTvSeriesId("The Office", "2005", [
      { id: 1, name: "The Office", year: "2001" },
      { id: 2, name: "The Office", year: "2005" },
    ]);
    expect(id).toBe(2);
  });

  it("still matches when the provider title includes the year", () => {
    expect(
      pickTvSeriesId("The Sopranos (1999)", "1999", [
        { id: 1396, name: "The Sopranos", year: "1999" },
      ])
    ).toBe(1396);
  });

  it("ignores a weak title match", () => {
    expect(
      pickTvSeriesId("Live News", "2020", [
        { id: 9, name: "The Sopranos", year: "1999" },
      ])
    ).toBeNull();
  });

  it("uses the catalog name for that season and episode", () => {
    const catalog = { "1": { "1": "Pilot", "2": "46 Long" } };
    expect(lookupEpisodeTitle(catalog, "1", 1)).toBe("Pilot");
    expect(lookupEpisodeTitle(catalog, "1", "2")).toBe("46 Long");
    expect(lookupEpisodeTitle(catalog, "2", 1)).toBeNull();
  });

  it("replaces a filename-style provider title and keeps it when there is no match", () => {
    expect(
      displayEpisodeTitle({
        providerTitle: "The Sopranos S01E01",
        catalogTitle: "Pilot",
        seriesName: "The Sopranos",
      })
    ).toBe("Pilot");
    expect(
      displayEpisodeTitle({
        providerTitle: "The Sopranos S01E03",
        catalogTitle: null,
        seriesName: "The Sopranos",
      })
    ).toBe("The Sopranos S01E03");
  });

  it("does not replace a title with the show name or a blank episode label", () => {
    expect(
      displayEpisodeTitle({
        providerTitle: "The Sopranos S01E01",
        catalogTitle: "The Sopranos",
        seriesName: "The Sopranos",
      })
    ).toBe("The Sopranos S01E01");
    expect(
      displayEpisodeTitle({
        providerTitle: "Cold Open",
        catalogTitle: "Episode 4",
        seriesName: "The Sopranos",
      })
    ).toBe("Cold Open");
  });
});
