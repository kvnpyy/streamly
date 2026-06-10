import { describe, expect, it } from "vitest";
import {
  buildLiveShelfMeta,
  buildLiveShelfMetaFromIndex,
  collectRegionalShelfPreview,
  filterStreamsForTvRegion,
} from "./live-category-shelf";
import type { Category, LiveStream } from "@/lib/xtream-types";

function ch(id: number, name: string, categoryId = "1"): LiveStream {
  return {
    stream_id: id,
    name,
    category_id: categoryId,
    stream_icon: "",
  } as LiveStream;
}

describe("buildLiveShelfMeta", () => {
  const cat: Category = {
    category_id: "99",
    category_name: "UK | Entertainment",
  } as Category;

  it("returns preview slice without scanning full list when region matches category", () => {
    const channels = Array.from({ length: 200 }, (_, i) =>
      ch(i, `UK: Channel ${i}`)
    );
    const meta = buildLiveShelfMeta(cat, channels, "Europe", 8);
    expect(meta?.preview).toHaveLength(8);
    expect(meta?.total).toBe(200);
  });

  it("hides shelf when category region mismatches filter", () => {
    const meta = buildLiveShelfMeta(cat, [ch(1, "UK: One")], "North America", 8);
    expect(meta).toBeNull();
  });

  it("buildLiveShelfMetaFromIndex resolves preview without a channel array", () => {
    const byId = new Map(
      Array.from({ length: 20 }, (_, i) => [
        i,
        ch(i, `UK: Channel ${i}`),
      ] as const)
    );
    const meta = buildLiveShelfMetaFromIndex(
      cat,
      Array.from({ length: 200 }, (_, i) => i),
      byId,
      "Europe",
      8
    );
    expect(meta?.preview).toHaveLength(8);
    expect(meta?.total).toBe(200);
  });

  it("skips generic categories when the first indexed channels are out of region", () => {
    const generic: Category = {
      category_id: "2",
      category_name: "Sports",
    } as Category;
    const byId = new Map(
      Array.from({ length: 12 }, (_, i) => [
        i,
        ch(i, `US: Channel ${i}`),
      ] as const)
    );
    const meta = buildLiveShelfMetaFromIndex(
      generic,
      Array.from({ length: 200 }, (_, i) => i),
      byId,
      "Europe",
      8
    );
    expect(meta).toBeNull();
  });

  it("returns null when region filter excludes every channel in the index", () => {
    const generic: Category = {
      category_id: "1",
      category_name: "Sports",
    } as Category;
    const byId = new Map([
      [1, ch(1, "US: ESPN")],
      [2, ch(2, "US: Fox Sports")],
    ] as const);
    const meta = buildLiveShelfMetaFromIndex(
      generic,
      [1, 2],
      byId,
      "Europe",
      8
    );
    expect(meta).toBeNull();
  });

  it("finds regional matches deep in large mixed category lists", () => {
    const ids = Array.from({ length: 120 }, (_, i) => i);
    const byId = new Map(
      ids.map((i) => [
        i,
        ch(i, i < 100 ? `US: Channel ${i}` : `UK: Channel ${i}`),
      ] as const)
    );
    const preview = collectRegionalShelfPreview(
      ids,
      (id) => byId.get(id),
      "Sports",
      "Europe",
      4
    );
    expect(preview).toHaveLength(4);
    expect(preview.every((s) => s.name.startsWith("UK:"))).toBe(true);

    const meta = buildLiveShelfMetaFromIndex(
      { category_id: "1", category_name: "Sports" } as Category,
      ids,
      byId,
      "Europe",
      4
    );
    expect(meta?.preview).toHaveLength(4);
  });

  it("filterStreamsForTvRegion keeps generic channels in a prefixless category", () => {
    const generic: Category = {
      category_id: "1",
      category_name: "Sports",
    } as Category;
    const channels = [
      ch(1, "UK: Sky"),
      ch(2, "Eurosport"),
      ch(3, "US: ESPN"),
    ];
    const filtered = filterStreamsForTvRegion(
      channels,
      "Europe",
      generic.category_name
    );
    expect(filtered.map((c) => c.stream_id)).toEqual([1, 2]);
  });
});
