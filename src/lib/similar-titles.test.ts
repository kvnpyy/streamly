import { describe, expect, it } from "vitest";
import { pickSimilarMovies, pickSimilarSeries } from "./similar-titles";

describe("similar-titles", () => {
  const movies = [
    {
      num: 1,
      name: "Alpha",
      stream_type: "movie" as const,
      stream_id: 1,
      stream_icon: "a.jpg",
      year: "2020",
      rating: "8",
      added: "1",
      category_id: "10",
    },
    {
      num: 2,
      name: "Beta",
      stream_type: "movie" as const,
      stream_id: 2,
      stream_icon: "b.jpg",
      year: "2021",
      rating: "7",
      added: "1",
      category_id: "10",
    },
    {
      num: 3,
      name: "Gamma",
      stream_type: "movie" as const,
      stream_id: 3,
      stream_icon: "c.jpg",
      year: "2019",
      rating: "6",
      added: "1",
      category_id: "20",
    },
  ];

  it("pickSimilarMovies matches same category", () => {
    const out = pickSimilarMovies(movies, 1, "10", "Action", {
      hideAdult: false,
      parentalUnlocked: true,
    });
    expect(out.map((x) => x.id)).toEqual([2]);
  });

  it("pickSimilarSeries ranks by shared genre tokens", () => {
    const series = [
      {
        num: 1,
        name: "Drama A",
        series_id: 1,
        cover: "a.jpg",
        genre: "Action, Thriller",
        category_id: "1",
      },
      {
        num: 2,
        name: "Drama B",
        series_id: 2,
        cover: "b.jpg",
        genre: "Action, Comedy",
        category_id: "1",
      },
    ];
    const out = pickSimilarSeries(series, 1, "Action, Thriller", {
      hideAdult: false,
      parentalUnlocked: true,
    });
    expect(out.map((x) => x.id)).toEqual([2]);
  });
});
