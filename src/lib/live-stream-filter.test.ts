import { describe, expect, it } from "vitest";
import {
  buildStreamByIdMap,
  materializeLiveCategoryStreams,
  pickStreamsForCategory,
} from "./live-stream-filter";
import type { LiveStream } from "./xtream-types";

describe("live-stream-filter", () => {
  const streams = [
    { stream_id: 1, category_id: "10", name: "A" },
    { stream_id: 2, category_id: "10", name: "B" },
    { stream_id: 3, category_id: "20", name: "C" },
  ] as LiveStream[];

  it("picks by category index in O(k)", () => {
    const byId = buildStreamByIdMap(streams);
    const picked = pickStreamsForCategory(
      streams,
      "10",
      { "10": [1, 2], "20": [3] },
      byId
    );
    expect(picked.map((s) => s.stream_id)).toEqual([1, 2]);
  });

  it("caps category materialization so huge categories cannot freeze the UI", () => {
    const byId = buildStreamByIdMap(streams);
    const ids = Array.from({ length: 10_000 }, (_, i) => i + 1);
    const picked = materializeLiveCategoryStreams({
      all: streams,
      categoryId: "10",
      streamIdsByCategory: { "10": ids },
      streamById: byId,
      maxItems: 2,
      allowedCatIds: new Set(["10", "20"]),
      hideAdult: false,
      parentalUnlocked: true,
    });
    expect(picked).toHaveLength(2);
  });

  it("uses server index without a full streamById map", () => {
    const ids = Array.from({ length: 500 }, (_, i) => i + 1);
    const picked = materializeLiveCategoryStreams({
      all: streams,
      categoryId: "10",
      streamIdsByCategory: { "10": [1, 2, ...ids] },
      streamById: undefined,
      maxItems: 2,
      allowedCatIds: new Set(["10"]),
      hideAdult: false,
      parentalUnlocked: true,
    });
    expect(picked.map((s) => s.stream_id)).toEqual([1, 2]);
  });
});
