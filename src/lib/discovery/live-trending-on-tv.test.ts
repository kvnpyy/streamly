import { describe, expect, it } from "vitest";
import {
  buildLiveTrendingOnTv,
  mergeTmdbTrendingLists,
} from "@/lib/discovery/live-trending-on-tv";
import type { StreamEpgSnapshot } from "@/lib/discovery/live-epg";
import type { TmdbTrendingItem } from "@/lib/discovery/types";
import type { LiveStream } from "@/lib/xtream-types";

function stream(id: number, name: string): LiveStream {
  return {
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
}

describe("buildLiveTrendingOnTv", () => {
  const trending: TmdbTrendingItem[] = [
    {
      tmdbId: 1,
      title: "90 Day Fiancé",
      popularity: 100,
    },
    {
      tmdbId: 2,
      title: "Inception",
      year: "2010",
      popularity: 80,
    },
  ];

  it("omits channel-label-only rows", () => {
    const channels = new Map<number, LiveStream>([
      [1, stream(1, "[USA] ABC EAST HD")],
    ]);
    const snapshots = new Map<number, StreamEpgSnapshot>([
      [1, { nowTitle: "[USA] ABC EAST HD" }],
    ]);
    const items = buildLiveTrendingOnTv(
      [1],
      channels,
      snapshots,
      [{ tmdbId: 1, title: "Show", popularity: 10 }],
      new Set(),
      new Set()
    );
    expect(items).toHaveLength(0);
  });

  it("excludes stale rerun sports library slots", () => {
    const channels = new Map<number, LiveStream>([
      [3, stream(3, "NFL Network HD")],
    ]);
    const snapshots = new Map<number, StreamEpgSnapshot>([
      [3, { nowTitle: "NFL Classic Games" }],
    ]);
    const items = buildLiveTrendingOnTv(
      [3],
      channels,
      snapshots,
      [],
      new Set(),
      new Set()
    );
    expect(items).toHaveLength(0);
  });

  it("includes live sports without TMDB match", () => {
    const channels = new Map<number, LiveStream>([
      [9, stream(9, "ESPN HD")],
    ]);
    const snapshots = new Map<number, StreamEpgSnapshot>([
      [9, { nowTitle: "NBA Finals: Celtics at Lakers" }],
    ]);
    const items = buildLiveTrendingOnTv(
      [9],
      channels,
      snapshots,
      [],
      new Set(),
      new Set()
    );
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.programmeTitle.toLowerCase()).toContain("nba");
  });

  it("prioritizes TMDB-matched on-air titles", () => {
    const channels = new Map<number, LiveStream>([
      [1, stream(1, "TLC HD")],
      [2, stream(2, "HBO")],
    ]);
    const snapshots = new Map<number, StreamEpgSnapshot>([
      [1, { nowTitle: "90 Day Fiance: Happily Ever After" }],
      [2, { nowTitle: "Random local news" }],
    ]);

    const items = buildLiveTrendingOnTv(
      [1, 2],
      channels,
      snapshots,
      trending,
      new Set(),
      new Set()
    );

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]!.stream.stream_id).toBe(1);
    expect(items[0]!.programmeTitle.toLowerCase()).toContain("90 day");
  });

  it("merges movie and TV trending without duplicate tmdb ids", () => {
    const merged = mergeTmdbTrendingLists(
      [{ tmdbId: 5, title: "A", popularity: 10 }],
      [{ tmdbId: 5, title: "A", popularity: 50 }, { tmdbId: 6, title: "B", popularity: 1 }]
    );
    expect(merged).toHaveLength(2);
    expect(merged[0]!.tmdbId).toBe(5);
    expect(merged[0]!.popularity).toBe(50);
  });
});
