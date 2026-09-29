import { describe, expect, it } from "vitest";
import { swapAccountLibrary } from "./library-by-account";

const movie = {
  kind: "movie" as const,
  id: 1,
  name: "Old playlist",
  addedAt: 1,
  lastAt: 2,
};

describe("swapAccountLibrary", () => {
  it("keeps the first playlist's continue watching when switching away and back", () => {
    const start = swapAccountLibrary(
      {
        favorites: [],
        recents: [movie],
        recentDismissedAt: {},
        libraryByAccount: {},
      },
      null,
      "a|user"
    );
    const switched = swapAccountLibrary(start, "a|user", "b|user");
    expect(switched.recents).toEqual([]);
    expect(switched.libraryByAccount["a|user"]?.recents).toEqual([movie]);
    const back = swapAccountLibrary(switched, "b|user", "a|user");
    expect(back.recents).toEqual([movie]);
  });
});
