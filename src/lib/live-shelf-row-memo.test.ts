import { describe, expect, it } from "vitest";
import { liveShelfRowPropsAreEqual } from "./live-shelf-row-memo";
import type { LiveShelfMeta } from "./live-category-shelf";
import type { LiveStream } from "@/lib/xtream-types";

function shelf(id: string, streamIds: number[]): LiveShelfMeta {
  return {
    id,
    title: id,
    preview: streamIds.map(
      (stream_id) =>
        ({ stream_id, name: `Ch ${stream_id}`, category_id: "1" }) as LiveStream
    ),
    total: streamIds.length,
  };
}

describe("liveShelfRowPropsAreEqual", () => {
  it("returns true when unrelated EPG map entries change", () => {
    const s = shelf("a", [1, 2]);
    const prevMap = new Map<number, string>([[1, "Show A"], [99, "Other"]]);
    const nextMap = new Map<number, string>([
      [1, "Show A"],
      [99, "Changed"],
    ]);
    expect(
      liveShelfRowPropsAreEqual(
        { shelf: s, maxPerShelf: 5, nowPlayingMap: prevMap },
        { shelf: s, maxPerShelf: 5, nowPlayingMap: nextMap }
      )
    ).toBe(true);
  });

  it("returns false when a preview tile EPG line changes", () => {
    const s = shelf("a", [1]);
    const prevMap = new Map<number, string>([[1, "Show A"]]);
    const nextMap = new Map<number, string>([[1, "Show B"]]);
    expect(
      liveShelfRowPropsAreEqual(
        { shelf: s, maxPerShelf: 5, nowPlayingMap: prevMap },
        { shelf: s, maxPerShelf: 5, nowPlayingMap: nextMap }
      )
    ).toBe(false);
  });
});
