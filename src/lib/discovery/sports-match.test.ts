import { describe, expect, it } from "vitest";
import {
  buildSportsOnGuideEntries,
  matchEventsToChannels,
} from "@/lib/discovery/sports-match";
import type { CachedSportEvent } from "@/lib/discovery/sports-types";
import type { StreamEpgSnapshot } from "@/lib/discovery/live-epg";
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

const ufcEvent: CachedSportEvent = {
  id: "99",
  title: "UFC 310: Pantoja vs Asakura",
  date: "2025-05-25",
  tier: "main",
  keywords: ["ufc 310", "ufc", "pantoja"],
};

describe("matchEventsToChannels", () => {
  it("matches programme title to event keywords", () => {
    const snapshots = new Map<number, StreamEpgSnapshot>([
      [1, { nowTitle: "UFC 310 Prelims Live" }],
    ]);
    const channelById = new Map([[1, stream(1, "ESPN+ PPV")]]);

    const matches = matchEventsToChannels(
      [ufcEvent],
      snapshots,
      channelById
    );
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0].stream.stream_id).toBe(1);
    expect(matches[0].confidence).toBeGreaterThanOrEqual(0.55);
  });
});

describe("buildSportsOnGuideEntries", () => {
  it("includes sports EPG titles and excludes matched streams", () => {
    const snapshots = new Map<number, StreamEpgSnapshot>([
      [2, { nowTitle: "NFL Sunday Night Football" }],
      [3, { nowTitle: "Evening News" }],
    ]);
    const channelById = new Map([
      [2, stream(2, "NBC Sports")],
      [3, stream(3, "Local News")],
    ]);

    const entries = buildSportsOnGuideEntries(
      snapshots,
      channelById,
      new Set([2]),
      10
    );
    expect(entries.some((e) => e.stream.stream_id === 2)).toBe(false);
    expect(entries.some((e) => e.stream.stream_id === 3)).toBe(false);
  });

  it("finds sports when channel name is sports-branded", () => {
    const snapshots = new Map<number, StreamEpgSnapshot>([
      [4, { nowTitle: "Live coverage" }],
    ]);
    const channelById = new Map([[4, stream(4, "beIN Sports 1")]]);

    const entries = buildSportsOnGuideEntries(
      snapshots,
      channelById,
      new Set(),
      10
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].stream.stream_id).toBe(4);
  });
});
