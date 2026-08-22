import { describe, expect, it } from "vitest";
import { buildLiveChannelIndex } from "@/lib/live-channel-index";
import {
  EMPTY_PROGRAMME_SCAN_IDS,
  filterStreamsByLiveQuery,
  mergeLiveSearchResults,
  planLiveProgrammeSearch,
} from "@/lib/live-programme-search";
import type { LiveStream } from "@/lib/xtream-types";

function ch(id: number, name: string): LiveStream {
  return {
    stream_id: id,
    name,
    category_id: "1",
    stream_icon: "",
  } as LiveStream;
}

describe("live-programme-search", () => {
  it("plans only non-name matches up to maxScan", () => {
    const streams = [
      ch(1, "CNN"),
      ch(2, "BBC News"),
      ch(3, "ESPN"),
    ];
    const plan = planLiveProgrammeSearch(streams, "football", 1);
    expect(plan.candidateIds).toEqual([1]);
    expect(plan.truncated).toBe(true);
    expect(plan.nonNameMatchCount).toBe(3);
  });

  it("uses channel index without re-lowercasing names", () => {
    const streams = [ch(1, "CNN"), ch(2, "HBO")];
    const plan = planLiveProgrammeSearch(
      buildLiveChannelIndex(streams),
      "football",
      10
    );
    expect(plan.candidateIds).toEqual([1, 2]);
    expect(plan.truncated).toBe(false);
  });

  it("keeps a stable empty candidate list for effect deps", () => {
    expect(EMPTY_PROGRAMME_SCAN_IDS).toEqual([]);
    expect(EMPTY_PROGRAMME_SCAN_IDS).toBe(EMPTY_PROGRAMME_SCAN_IDS);
  });

  it("merges name and programme matches without duplicates", () => {
    const streams = [ch(1, "CNN"), ch(2, "HBO")];
    const nameMatched = [streams[0]!];
    const merged = mergeLiveSearchResults(
      nameMatched,
      streams,
      "game",
      new Map(),
      new Map([[2, "Big Game Night"]])
    );
    expect(merged.map((s) => s.stream_id)).toEqual([1, 2]);
  });

  it("filters by channel name in one pass", () => {
    const streams = [ch(1, "CNN"), ch(2, "HBO")];
    const visible = filterStreamsByLiveQuery(
      streams,
      "cnn",
      new Map(),
      new Map()
    );
    expect(visible.map((s) => s.stream_id)).toEqual([1]);
  });
});
