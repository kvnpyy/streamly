import { describe, expect, it } from "vitest";
import { buildLiveRecentStreams, liveRecentFlipStreams } from "@/lib/live-recent-streams";
import type { RecentItem } from "@/store/preferences";

const recent = (id: number, name: string): RecentItem => ({
  kind: "live",
  id,
  name,
  icon: "",
  addedAt: 1,
  lastAt: 2,
});

describe("buildLiveRecentStreams", () => {
  it("keeps recents when catalog lookup is empty", () => {
    const rows = buildLiveRecentStreams([recent(42, "News HD")], []);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.stream.stream_id).toBe(42);
    expect(rows[0]!.stream.name).toBe("News HD");
  });

  it("prefers catalog row when present", () => {
    const rows = buildLiveRecentStreams(
      [recent(7, "Stale name")],
      [
        {
          num: 1,
          name: "Fresh name",
          stream_type: "live",
          stream_id: 7,
          stream_icon: "http://x/logo.png",
          added: "",
          category_id: "1",
          tv_archive: 0,
        },
      ]
    );
    expect(rows[0]!.stream.name).toBe("Fresh name");
  });
});

describe("liveRecentFlipStreams", () => {
  it("puts the playing channel first", () => {
    const stream = {
      num: 0,
      name: "B",
      stream_type: "live" as const,
      stream_id: 2,
      stream_icon: "",
      added: "",
      category_id: "0",
      tv_archive: 0,
    };
    const ordered = liveRecentFlipStreams(
      stream,
      [
        { ...stream, stream_id: 1, name: "A" },
        stream,
        { ...stream, stream_id: 3, name: "C" },
      ],
      []
    );
    expect(ordered[0]!.stream_id).toBe(2);
  });
});
