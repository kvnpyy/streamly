import { describe, expect, it } from "vitest";
import {
  scoreOnNowEntry,
  scoreTonightEntry,
} from "@/lib/discovery/live-scoring";
import type { LiveStream } from "@/lib/xtream-types";

const stream: LiveStream = {
  num: 1,
  name: "US: ESPN HD",
  stream_type: "live",
  stream_id: 42,
  stream_icon: "",
  added: "1",
  category_id: "1",
  tv_archive: 0,
};

describe("scoreOnNowEntry", () => {
  it("scores higher for major network and hype keywords", () => {
    const base = scoreOnNowEntry(
      stream,
      "SportsCenter",
      new Set(),
      new Set()
    );
    const boosted = scoreOnNowEntry(
      stream,
      "UFC 300 Main Card Live",
      new Set([42]),
      new Set([42])
    );
    expect(boosted).toBeGreaterThan(base);
  });
});

describe("scoreTonightEntry", () => {
  it("boosts programmes starting within two hours", () => {
    const now = Math.floor(Date.now() / 1000);
    const soon = scoreTonightEntry(
      stream,
      { title: "90 Day Fiancé", startSec: now + 3600 },
      new Set(),
      new Set(),
      now
    );
    const later = scoreTonightEntry(
      stream,
      { title: "90 Day Fiancé", startSec: now + 6 * 3600 },
      new Set(),
      new Set(),
      now
    );
    expect(soon).toBeGreaterThan(later);
  });
});
