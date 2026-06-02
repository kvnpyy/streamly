import { describe, expect, it } from "vitest";
import { buildLiveSearchHitsByCategory } from "@/lib/live-shelf-search-hits";
import type { LiveStream } from "@/lib/xtream-types";

function ch(id: number, name: string, catId: string): LiveStream {
  return {
    stream_id: id,
    name,
    category_id: catId,
    stream_icon: "",
  } as LiveStream;
}

describe("buildLiveSearchHitsByCategory", () => {
  it("groups matches in one pass when no server index", () => {
    const streams = [ch(1, "CNN HD", "10"), ch(2, "ESPN", "20")];
    const byId = new Map(streams.map((s) => [s.stream_id, s]));
    const nameLower = new Map(streams.map((s) => [s.stream_id, s.name.toLowerCase()]));

    const hits = buildLiveSearchHitsByCategory({
      queryLower: "cnn",
      streamIdsByCategory: null,
      streamById: byId,
      streams,
      nameLowerById: nameLower,
      nowPlayingMap: new Map(),
    });

    expect(hits.get("10")?.map((s) => s.stream_id)).toEqual([1]);
    expect(hits.has("20")).toBe(false);
  });

  it("does not scan entire huge category id lists", () => {
    const streams = [ch(500, "Match Late", "10")];
    const byId = new Map(streams.map((s) => [s.stream_id, s]));
    const ids = Array.from({ length: 5_000 }, (_, i) => i + 1);
    ids[120] = 500;

    const hits = buildLiveSearchHitsByCategory({
      queryLower: "match",
      streamIdsByCategory: { "10": ids },
      streamById: byId,
      streams: [],
      nameLowerById: new Map(),
      nowPlayingMap: new Map(),
      categoryIds: ["10"],
      maxHitsPerCategory: 3,
    });

    expect(hits.get("10")?.map((s) => s.stream_id)).toEqual([500]);
  });
});
