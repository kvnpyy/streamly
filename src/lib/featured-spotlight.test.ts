import { describe, expect, it } from "vitest";
import { pickFeaturedSpotlight } from "./featured-spotlight";

describe("pickFeaturedSpotlight", () => {
  const accountKey = "http://x|user";

  it("prefers in-progress movie over newer live", () => {
    const pick = pickFeaturedSpotlight(
      [
        {
          kind: "live",
          id: 1,
          name: "News",
          addedAt: 100,
          lastAt: 500,
        },
        {
          kind: "movie",
          id: 9,
          name: "Film",
          addedAt: 50,
          lastAt: 200,
        },
      ],
      accountKey,
      { [`${accountKey}|movie|9`]: 600 }
    );
    expect(pick?.kind).toBe("movie");
    expect(pick?.hasResume).toBe(true);
    expect(pick?.ctaLabel).toBe("Resume");
  });

  it("falls back to recent movie without resume", () => {
    const pick = pickFeaturedSpotlight(
      [
        {
          kind: "series",
          id: 2,
          name: "Show",
          addedAt: 1,
          lastAt: 10,
        },
        {
          kind: "movie",
          id: 3,
          name: "Alpha",
          addedAt: 1,
          lastAt: 20,
        },
      ],
      accountKey,
      {}
    );
    expect(pick?.title).toBe("Alpha");
    expect(pick?.ctaLabel).toBe("Play");
  });

  it("returns null when no recents", () => {
    expect(pickFeaturedSpotlight([], accountKey, {})).toBeNull();
  });
});
