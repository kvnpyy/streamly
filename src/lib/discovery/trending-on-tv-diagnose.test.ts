import { describe, expect, it } from "vitest";
import {
  diagnoseTrendingOnTvPipeline,
  formatTrendingDiagnoseReport,
} from "@/lib/discovery/trending-on-tv-diagnose";
import type { StreamEpgSnapshot } from "@/lib/discovery/live-epg";
import type { LiveStream } from "@/lib/xtream-types";

function ch(id: number, name: string): LiveStream {
  return {
    num: id,
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

describe("trending-on-tv-diagnose", () => {
  it("passes with shelf-like US programme titles (no TMDB)", () => {
    const channelById = new Map<number, LiveStream>([
      [1, ch(1, "A&E HD")],
      [2, ch(2, "GAC FAMILY HD")],
      [3, ch(3, "MAGNOLIA NETWORK HD")],
      [4, ch(4, "ARIZONA'S FAMILY")],
    ]);
    const snapshots = new Map<number, StreamEpgSnapshot>([
      [1, { nowTitle: "The First 48" }],
      [2, { nowTitle: "A Charming Valentine" }],
      [3, { nowTitle: "Fixer Upper" }],
      [4, { nowTitle: "InvestigateTV+" }],
    ]);
    const report = diagnoseTrendingOnTvPipeline({
      candidateIds: [1, 2, 3, 4],
      channelById,
      snapshots,
      tmdbTrending: [],
    });
    expect(report.finalQualityPass).toBe(true);
    expect(report.finalCount).toBeGreaterThanOrEqual(3);
  });

  it("reports channel-only rejection in samples", () => {
    const channelById = new Map<number, LiveStream>([
      [1, ch(1, "[USA] ABC EAST HD")],
    ]);
    const snapshots = new Map<number, StreamEpgSnapshot>([
      [1, { nowTitle: "[USA] ABC EAST HD" }],
    ]);
    const report = diagnoseTrendingOnTvPipeline({
      candidateIds: [1],
      channelById,
      snapshots,
    });
    expect(report.fallbackQualityPass).toBe(false);
    expect(formatTrendingDiagnoseReport(report)).toContain("channel-only");
  });
});
