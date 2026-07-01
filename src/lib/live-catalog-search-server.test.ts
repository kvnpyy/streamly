import { describe, expect, it } from "vitest";
import { searchLiveCatalog } from "@/lib/live-catalog-search-server";
import type { LiveStream } from "@/lib/xtream-types";
import type { LiveCatalogBundle } from "@/lib/xtream";

function ch(id: number, name: string, catId: string): LiveStream {
  return {
    stream_id: id,
    name,
    category_id: catId,
    stream_icon: "",
  } as LiveStream;
}

function bundle(streams: LiveStream[]): {
  bundle: LiveCatalogBundle;
  index: Record<string, number[]>;
  streamById: Map<number, LiveStream>;
} {
  const index: Record<string, number[]> = {};
  const streamById = new Map<number, LiveStream>();
  for (const s of streams) {
    streamById.set(s.stream_id, s);
    const cid = String(s.category_id);
    const bucket = index[cid];
    if (bucket) bucket.push(s.stream_id);
    else index[cid] = [s.stream_id];
  }
  return {
    bundle: {
      categories: [
        { category_id: "10", category_name: "US News", parent_id: 0 },
        { category_id: "20", category_name: "US Sports", parent_id: 0 },
      ],
      streams,
      countByCategoryId: {
        "10": index["10"]?.length ?? 0,
        "20": index["20"]?.length ?? 0,
      },
      streamIdsByCategory: index,
    },
    index,
    streamById,
  };
}

describe("searchLiveCatalog", () => {
  it("finds channels by name across the full catalog, not just the first sample", () => {
    const streams = [
      ch(1, "Early Channel", "10"),
      ch(2, "Another One", "10"),
      ch(500, "Zebra Sports HD", "20"),
    ];
    const ctx = bundle(streams);

    const result = searchLiveCatalog(
      ctx.bundle,
      ctx.index,
      ctx.streamById,
      { q: "zebra" }
    );

    expect(result.matches.map((s) => s.stream_id)).toEqual([500]);
    expect(result.scanPool.map((s) => s.stream_id)).toContain(500);
  });

  it("scopes search to one category", () => {
    const streams = [ch(1, "CNN HD", "10"), ch(2, "CNN Sports", "20")];
    const ctx = bundle(streams);

    const result = searchLiveCatalog(
      ctx.bundle,
      ctx.index,
      ctx.streamById,
      { q: "cnn", categoryId: "10" }
    );

    expect(result.matches.map((s) => s.stream_id)).toEqual([1]);
  });

  it("finds name matches after the EPG scan pool window", () => {
    const streams = Array.from({ length: 600 }, (_, i) =>
      ch(i + 1, `Channel ${i + 1}`, "10")
    );
    streams.push(ch(999, "Late Match HD", "10"));
    const ctx = bundle(streams);

    const result = searchLiveCatalog(
      ctx.bundle,
      ctx.index,
      ctx.streamById,
      { q: "late match", scanPoolLimit: 120 }
    );

    expect(result.matches.map((s) => s.stream_id)).toEqual([999]);
    expect(result.scanPool.length).toBe(120);
  });
});
