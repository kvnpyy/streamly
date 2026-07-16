import { describe, expect, it } from "vitest";
import { shouldServeTrendingResponseCache } from "@/lib/discovery/trending-on-tv-cache";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import type { LiveStream } from "@/lib/xtream-types";

function entry(
  programmeTitle: string,
  streamId: number
): ScoredLiveEntry {
  return {
    programmeTitle,
    score: 1,
    stream: {
      num: streamId,
      stream_id: streamId,
      name: `Ch ${streamId}`,
      stream_icon: "",
      stream_type: "live",
      epg_channel_id: "",
      added: "",
      category_id: "1",
      custom_sid: "",
      tv_archive: 0,
      direct_source: "",
      tv_archive_duration: 0,
    } satisfies LiveStream,
  };
}

describe("shouldServeTrendingResponseCache", () => {
  const now = 1_000_000;
  const ttl = 60_000;

  it("serves a fresh quality shelf regardless of client hints", () => {
    const cached = {
      items: [
        entry("Show A", 1),
        entry("Show B", 2),
        entry("Show C", 3),
      ],
      tmdbCountry: "US",
      at: now - 1_000,
    };
    expect(shouldServeTrendingResponseCache(cached, now, ttl)).toBe(true);
  });

  it("rejects expired or low-quality cache entries", () => {
    expect(
      shouldServeTrendingResponseCache(
        {
          items: [entry("Only one", 1)],
          tmdbCountry: "US",
          at: now - 1_000,
        },
        now,
        ttl
      )
    ).toBe(false);

    expect(
      shouldServeTrendingResponseCache(
        {
          items: [
            entry("Show A", 1),
            entry("Show B", 2),
            entry("Show C", 3),
          ],
          tmdbCountry: "US",
          at: now - ttl - 1,
        },
        now,
        ttl
      )
    ).toBe(false);

    expect(shouldServeTrendingResponseCache(undefined, now, ttl)).toBe(false);
  });
});
