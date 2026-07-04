import { describe, expect, it } from "vitest";
import type { SeriesEpisode } from "@/lib/xtream-types";
import {
  dedupeSeriesEpisodes,
  normalizeSeriesEpisodesMap,
  pickPreferredSeriesEpisode,
  sortSeriesEpisodes,
} from "./series-episodes";

function ep(
  id: string,
  episode_num: number | string,
  added?: string
): SeriesEpisode {
  return {
    id,
    episode_num,
    title: `Episode ${episode_num}`,
    container_extension: "mkv",
    added,
  };
}

describe("dedupeSeriesEpisodes", () => {
  it("removes duplicate ids keeping newer added", () => {
    const { episodes, stripped } = dedupeSeriesEpisodes([
      ep("100", 1, "1700000000"),
      ep("100", 1, "1800000000"),
    ]);
    expect(stripped).toBe(1);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.added).toBe("1800000000");
  });

  it("removes duplicate episode_num with different ids", () => {
    const { episodes, stripped } = dedupeSeriesEpisodes([
      ep("10", 2, "100"),
      ep("11", 2, "200"),
    ]);
    expect(stripped).toBe(1);
    expect(episodes).toHaveLength(1);
    expect(episodes[0]?.id).toBe("11");
  });

  it("keeps distinct episodes", () => {
    const { episodes, stripped } = dedupeSeriesEpisodes([
      ep("1", 1),
      ep("2", 2),
      ep("3", 3),
    ]);
    expect(stripped).toBe(0);
    expect(episodes).toHaveLength(3);
  });
});

describe("sortSeriesEpisodes", () => {
  it("orders by episode_num numerically", () => {
    const sorted = sortSeriesEpisodes([ep("3", 10), ep("1", 2), ep("2", 9)]);
    expect(sorted.map((e) => e.episode_num)).toEqual([2, 9, 10]);
  });
});

describe("pickPreferredSeriesEpisode", () => {
  it("prefers higher added timestamp", () => {
    const chosen = pickPreferredSeriesEpisode(
      ep("1", 1, "1000"),
      ep("1", 1, "2000")
    );
    expect(chosen.added).toBe("2000");
  });
});

describe("normalizeSeriesEpisodesMap", () => {
  it("dedupes and sorts each season", () => {
    const { episodes, stripped } = normalizeSeriesEpisodesMap(
      {
        "1": [ep("2", 2), ep("1", 1), ep("1", 1)],
      },
      { log: false }
    );
    expect(stripped).toBe(1);
    expect(episodes["1"]?.map((e) => e.episode_num)).toEqual([1, 2]);
  });
});
