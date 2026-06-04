import { describe, expect, it } from "vitest";
import {
  diversifyTrendingOnTvEntries,
  programmeLooksLikeStaleRerun,
  shouldShowTrendingOnTvShelf,
} from "@/lib/discovery/live-trending-quality";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import type { LiveStream } from "@/lib/xtream-types";

function entry(programmeTitle: string, channelName: string): ScoredLiveEntry {
  return {
    programmeTitle,
    score: 50,
    stream: {
      stream_id: 1,
      name: channelName,
      stream_type: "live",
      stream_icon: "",
      epg_channel_id: "",
      added: "",
      category_id: "1",
      custom_sid: "",
      tv_archive: 0,
      direct_source: "",
      tv_archive_duration: 0,
    } satisfies LiveStream,
  };
}

describe("live-trending-quality", () => {
  it("flags classic/replay listings", () => {
    expect(programmeLooksLikeStaleRerun("NFL Classic Games")).toBe(true);
    expect(programmeLooksLikeStaleRerun("NBA Finals Game 7")).toBe(false);
  });

  it("requires at least three real programmes to show shelf", () => {
    expect(
      shouldShowTrendingOnTvShelf([
        entry("90 Day Fiancé", "TLC"),
        entry("Survivor", "CBS"),
      ])
    ).toBe(false);
    expect(
      shouldShowTrendingOnTvShelf([
        entry("90 Day Fiancé", "TLC"),
        entry("Survivor", "CBS"),
        entry("The Voice", "NBC"),
      ])
    ).toBe(true);
  });

  it("keeps one pick per network and per programme title", () => {
    const sorted: ScoredLiveEntry[] = [
      { ...entry("Euphoria", "[USA] HBO 2 EAST"), score: 90 },
      { ...entry("A Minecraft Movie", "[USA] HBO 3 EAST"), score: 85 },
      {
        ...entry("NBA Finals", "ESPN HD"),
        score: 80,
        stream: { ...entry("NBA Finals", "ESPN HD").stream, stream_id: 2 },
      },
    ];
    const out = diversifyTrendingOnTvEntries(sorted, 8);
    expect(out).toHaveLength(2);
    expect(out[0]!.programmeTitle).toBe("Euphoria");
    expect(out[1]!.programmeTitle).toBe("NBA Finals");
  });
});
