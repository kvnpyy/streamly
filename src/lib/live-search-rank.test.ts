import { describe, expect, it } from "vitest";
import { normalizeSearchText } from "@/lib/search-normalize";
import {
  scoreLiveSearchHit,
  sortLiveStreamsBySearchScore,
} from "@/lib/live-search-rank";
import type { LiveStream } from "@/lib/xtream-types";

function ch(id: number, name: string): LiveStream {
  return {
    stream_id: id,
    name,
    category_id: "1",
    stream_icon: "",
  } as LiveStream;
}

describe("live-search-rank", () => {
  it("ranks a numbered UFC event channel above UFC Network for query ufc", () => {
    const needle = normalizeSearchText("ufc");
    const network = scoreLiveSearchHit("UFC NETWORK", undefined, needle);
    const event = scoreLiveSearchHit("UFC 311 PPV HD", undefined, needle);
    expect(event).toBeGreaterThan(network);
    expect(network).toBeGreaterThan(0);
  });

  it("ranks a channel playing UFC 311 above UFC Network for query ufc", () => {
    const needle = normalizeSearchText("ufc");
    const network = scoreLiveSearchHit("UFC NETWORK", "UFC Unfiltered", needle);
    const ppv = scoreLiveSearchHit(
      "Sky Sports Box Office",
      "UFC 311: Makhachev vs Moicano",
      needle
    );
    expect(ppv).toBeGreaterThan(network);
  });

  it("keeps UFC 311 findable when the query is the event name", () => {
    const needle = normalizeSearchText("UFC 311");
    expect(scoreLiveSearchHit("UFC NETWORK", undefined, needle)).toBe(0);
    expect(
      scoreLiveSearchHit("UFC 311 PPV", undefined, needle)
    ).toBeGreaterThan(0);
    expect(
      scoreLiveSearchHit(
        "ESPN",
        "UFC 311: Makhachev vs Moicano",
        needle
      )
    ).toBeGreaterThan(0);
  });

  it("sorts the reported live-search case so the event is first", () => {
    const streams = [
      ch(1, "UFC NETWORK"),
      ch(2, "UFC Fight Pass"),
      ch(3, "Sky Sports Box Office"),
    ];
    const titles = new Map([
      [3, "UFC 311: Makhachev vs Moicano"],
      [1, "UFC Unfiltered"],
    ]);
    const ranked = sortLiveStreamsBySearchScore(
      streams,
      normalizeSearchText("ufc"),
      (s) => titles.get(s.stream_id)
    );
    expect(ranked.map((s) => s.stream_id)).toEqual([3, 1, 2]);
  });
});
