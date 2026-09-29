import { describe, expect, it } from "vitest";
import {
  collectionTitleCore,
  matchCollectionParts,
  nextCollectionMovie,
} from "./movie-collection";

const parts = [
  { tmdbId: 1, title: "The Dark Knight", year: "2008" },
  { tmdbId: 2, title: "The Dark Knight Rises", year: "2012" },
  { tmdbId: 3, title: "Batman Begins", year: "2005" },
];

describe("collectionTitleCore", () => {
  it("drops encode tags and a trailing year", () => {
    expect(collectionTitleCore("The Dark Knight (2008) 1080p BluRay x264")).toBe(
      "the dark knight"
    );
  });

  it("keeps a title that is only a year", () => {
    expect(collectionTitleCore("1917")).toBe("1917");
  });
});

describe("matchCollectionParts", () => {
  const catalog = [
    {
      streamId: 10,
      name: "Batman Begins 2005 1080p",
      containerExtension: "mkv",
    },
    {
      streamId: 11,
      name: "The Dark Knight (2008)",
      containerExtension: "mkv",
    },
    {
      streamId: 12,
      name: "The Dark Knight Rises 2012",
      containerExtension: "mp4",
    },
    { streamId: 99, name: "The Dark Knight Returns", year: "2013" },
  ];

  it("orders library matches and names the next film", () => {
    const matched = matchCollectionParts({
      parts: [parts[2]!, parts[0]!, parts[1]!],
      catalog,
      currentStreamId: 11,
      currentTmdbId: 1,
    });
    expect(matched.map((p) => p.streamId)).toEqual([10, 11, 12]);
    expect(matched.map((p) => p.relation)).toEqual([
      "prequel",
      "current",
      "sequel",
    ]);
    expect(nextCollectionMovie(matched)?.catalogName).toMatch(/Rises/);
  });

  it("does not treat a similarly named title as the same film", () => {
    const matched = matchCollectionParts({
      parts: [parts[0]!],
      catalog,
      currentStreamId: 11,
    });
    expect(matched.map((p) => p.streamId)).toEqual([11]);
  });

  it("pins the movie on screen when the library title would not match", () => {
    const matched = matchCollectionParts({
      parts: [parts[0]!, parts[1]!],
      catalog: [
        { streamId: 11, name: "TDK.2008.BluRay" },
        { streamId: 12, name: "The Dark Knight Rises 2012" },
      ],
      currentStreamId: 11,
      currentTmdbId: 1,
    });
    expect(matched.map((p) => [p.streamId, p.relation])).toEqual([
      [11, "current"],
      [12, "sequel"],
    ]);
    expect(nextCollectionMovie(matched)?.streamId).toBe(12);
  });

  it("rejects a remake whose year is far from the collection part", () => {
    const matched = matchCollectionParts({
      parts: [{ tmdbId: 4, title: "Dune", year: "2021" }],
      catalog: [{ streamId: 1, name: "Dune", year: "1984" }],
    });
    expect(matched).toEqual([]);
  });
});
