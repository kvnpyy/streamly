import { describe, expect, it } from "vitest";
import {
  buildManifestFromContiguousDisk,
  contiguousSegmentCount,
  countManifestSegments,
  encodedCoverageSec,
  encodedLooksFullyComplete,
  hasOrphanSegmentsBeyondPrefix,
  manifestIsTipOnlyTail,
  manifestReferencesMissingOrGappedSegments,
  MAX_IN_PROGRESS_PLAYLIST_SEGMENTS,
  parseStreamlyDurationSec,
  IN_PROGRESS_ENCODE_EDGE_HOLDBACK,
  prepareManifestForPlayback,
  rewriteTranscodeManifest,
  trimContiguousSegmentsFromStart,
  manifestNeedsContiguityHeal,
  resumeSeekSecForDiskPrefix,
  sumExtinfDurationSec,
} from "./vod-transcode-manifest";
import { shouldReuseTranscodeJobForSeek } from "./vod-transcode-seek-policy";

describe("rewriteTranscodeManifest", () => {
  it("rewrites segment lines to proxied transcode URLs", () => {
    const raw = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXTINF:6.000,",
      "seg_00001.ts",
      "#EXTINF:6.000,",
      "seg_00002.ts",
    ].join("\n");
    const out = rewriteTranscodeManifest(
      raw,
      "http://panel.example/series/u/p/1.mkv",
      true
    );
    expect(out).toContain("transcode=hls");
    expect(out).toContain("compat=mse");
    expect(out).toContain("media=seg_00001.ts");
  });

  it("trims in-progress playlists and preserves discontinuity markers", () => {
    const total = MAX_IN_PROGRESS_PLAYLIST_SEGMENTS + 40;
    const segs: string[] = ["#EXTM3U", "#EXT-X-VERSION:3"];
    for (let i = 0; i < total; i++) {
      segs.push("#EXT-X-DISCONTINUITY", "#EXTINF:1,", `seg_${String(i).padStart(5, "0")}.ts`);
    }
    const raw = segs.join("\n");
    const existing = new Set(
      Array.from({ length: total }, (_, i) => `seg_${String(i).padStart(5, "0")}.ts`)
    );
    const out = prepareManifestForPlayback(raw, false, existing);
    expect(out).toContain("#EXT-X-DISCONTINUITY");
    const uriCount = out.split("\n").filter((l) => /seg_\d+\.ts/i.test(l)).length;
    expect(uriCount).toBe(
      MAX_IN_PROGRESS_PLAYLIST_SEGMENTS - IN_PROGRESS_ENCODE_EDGE_HOLDBACK
    );
    expect(out).toContain("seg_00000.ts");
    expect(out).not.toContain(`seg_${String(total - 1).padStart(5, "0")}.ts`);
  });

  it("holds back the encode edge while the playlist is still growing", () => {
    const segs: string[] = ["#EXTM3U"];
    for (let i = 0; i < 8; i++) {
      segs.push("#EXTINF:4,", `seg_${String(i).padStart(5, "0")}.ts`);
    }
    const existing = new Set(
      Array.from({ length: 8 }, (_, i) => `seg_${String(i).padStart(5, "0")}.ts`)
    );
    const growing = prepareManifestForPlayback(segs.join("\n"), false, existing);
    expect(countManifestSegments(growing)).toBe(8 - IN_PROGRESS_ENCODE_EDGE_HOLDBACK);
    const lastKept = 8 - IN_PROGRESS_ENCODE_EDGE_HOLDBACK - 1;
    expect(growing).toContain(`seg_${String(lastKept).padStart(5, "0")}.ts`);
    expect(growing).not.toContain("seg_00007.ts");

    const done = prepareManifestForPlayback(segs.join("\n"), true, existing);
    expect(countManifestSegments(done)).toBe(8);
    expect(done).toContain("seg_00007.ts");
  });

  it("stops at the first missing segment in the sequence", () => {
    const raw = [
      "#EXTM3U",
      "#EXTINF:2,",
      "seg_00006.ts",
      "#EXTINF:2,",
      "seg_00007.ts",
      "#EXTINF:2,",
      "seg_00008.ts",
      "#EXTINF:2,",
      "seg_00010.ts",
    ].join("\n");
    const existing = new Set([
      "seg_00006.ts",
      "seg_00007.ts",
      "seg_00008.ts",
      "seg_00010.ts",
    ]);
    const out = prepareManifestForPlayback(raw, false, existing);
    expect(out).toContain("seg_00006.ts");
    expect(out).toContain("seg_00008.ts");
    expect(out).not.toContain("seg_00010.ts");
  });

  it("hasOrphanSegmentsBeyondPrefix detects seg_00058 after a 29-segment prefix", () => {
    const onDisk = new Set(
      Array.from({ length: 29 }, (_, i) => `seg_${String(i).padStart(5, "0")}.ts`)
    );
    onDisk.add("seg_00058.ts");
    expect(hasOrphanSegmentsBeyondPrefix(onDisk)).toBe(true);
    expect(contiguousSegmentCount(onDisk)).toBe(29);
  });

  it("contiguousSegmentCount stops at the first missing index", () => {
    expect(
      contiguousSegmentCount(new Set(["seg_00002.ts", "seg_00026.ts"]))
    ).toBe(0);
    const withPrefix = new Set(
      Array.from({ length: 27 }, (_, i) => `seg_${String(i).padStart(5, "0")}.ts`)
    );
    withPrefix.add("seg_00054.ts");
    expect(contiguousSegmentCount(withPrefix)).toBe(27);
  });

  it("trimContiguousSegmentsFromStart keeps only a contiguous prefix", () => {
    const pairs = [
      { extinf: "#EXTINF:2,", media: "seg_00000.ts" },
      { extinf: "#EXTINF:2,", media: "seg_00001.ts" },
      { extinf: "#EXTINF:2,", media: "seg_00003.ts" },
    ];
    expect(trimContiguousSegmentsFromStart(pairs).map((p) => p.media)).toEqual([
      "seg_00000.ts",
      "seg_00001.ts",
    ]);
  });

  it("buildManifestFromContiguousDisk lists flushed segments ahead of stale m3u8", () => {
    const onDisk = new Set(
      Array.from({ length: 12 }, (_, i) => `seg_${String(i).padStart(5, "0")}.ts`)
    );
    const stale = [
      "#EXTM3U",
      "#EXTINF:4.0,",
      "seg_00000.ts",
      "#EXTINF:4.0,",
      "seg_00001.ts",
    ].join("\n");
    const fromStale = prepareManifestForPlayback(stale, false, onDisk);
    expect(countManifestSegments(fromStale)).toBe(2);
    const rebuilt = buildManifestFromContiguousDisk(onDisk, new Map(), 4);
    expect(countManifestSegments(rebuilt)).toBe(12);
    expect(rebuilt).toContain("seg_00011.ts");
  });

  it("resumeSeekSecForDiskPrefix avoids empty-m3u8 tip freeze (ss=start + start_number=N)", () => {
    // Odyssey-style: job starts at 180s, 163 segs on disk, empty playlist after deploy.
    expect(
      resumeSeekSecForDiskPrefix({
        startOffsetSec: 180,
        prefixCount: 163,
        segmentSec: 4,
        manifestEncodedSec: 0,
      })
    ).toBe(180 + 163 * 4);
    expect(
      resumeSeekSecForDiskPrefix({
        startOffsetSec: 180,
        prefixCount: 163,
        segmentSec: 4,
        manifestEncodedSec: 652,
      })
    ).toBe(180 + 652);
    // Tail-only playlist shorter than disk prefix still floors to disk.
    expect(
      resumeSeekSecForDiskPrefix({
        startOffsetSec: 180,
        prefixCount: 163,
        segmentSec: 4,
        manifestEncodedSec: 40,
      })
    ).toBe(180 + 163 * 4);
  });

  it("manifestNeedsContiguityHeal detects empty or non-media playlists", () => {
    expect(manifestNeedsContiguityHeal("")).toBe(true);
    expect(manifestNeedsContiguityHeal("#EXTM3U\n")).toBe(true);
    expect(
      manifestNeedsContiguityHeal("#EXTM3U\n#EXTINF:4,\nseg_00000.ts\n")
    ).toBe(false);
  });

  it("only lists segments that exist on disk", () => {
    const segs: string[] = ["#EXTM3U", "#EXT-X-VERSION:3"];
    for (let i = 0; i < 80; i++) {
      segs.push("#EXTINF:2,", `seg_${String(i).padStart(5, "0")}.ts`);
    }
    const raw = segs.join("\n");
    const existing = new Set(
      Array.from({ length: 6 }, (_, i) => `seg_${String(i).padStart(5, "0")}.ts`)
    );
    const out = prepareManifestForPlayback(raw, false, existing);
    const uriCount = out.split("\n").filter((l) => /seg_\d+\.ts/i.test(l)).length;
    expect(uriCount).toBe(6 - IN_PROGRESS_ENCODE_EDGE_HOLDBACK);
  });

  it("marks complete playlists as VOD and adds seek timeline tags", () => {
    const raw = "#EXTM3U\n#EXTINF:6,\nseg_00001.ts\n#EXT-X-ENDLIST\n";
    const out = rewriteTranscodeManifest(raw, "http://x/m.mkv", false, {
      durationSec: 7200.5,
      playlistComplete: true,
      startOffsetSec: 120,
      encodedDurationSec: 6,
    });
    expect(out.startsWith("#EXTM3U\n")).toBe(true);
    expect(out).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(out).toContain("#EXT-X-STREAMLY-START-OFFSET-SEC:120");
    expect(out).toContain("#EXT-X-STREAMLY-ENCODED-DURATION-SEC:");
    expect(out).toContain("tc_seek=120");
    expect(parseStreamlyDurationSec(out)).toBeNull();
    const inProgress = rewriteTranscodeManifest(raw, "http://x/m.mkv", false, {
      durationSec: 7200.5,
      playlistComplete: false,
    });
    expect(inProgress).toContain("#EXT-X-PLAYLIST-TYPE:EVENT");
    expect(inProgress).not.toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(parseStreamlyDurationSec(inProgress)).toBeNull();
  });
});

describe("manifestReferencesMissingOrGappedSegments", () => {
  function manifestForSegs(count: number, start = 0): string {
    const lines = ["#EXTM3U", "#EXT-X-VERSION:3"];
    for (let i = start; i < start + count; i++) {
      lines.push("#EXTINF:4.000,");
      lines.push(`seg_${String(i).padStart(5, "0")}.ts`);
    }
    return lines.join("\n");
  }

  it("returns false when raw manifest exceeds playback trim cap but disk is contiguous", () => {
    const n = MAX_IN_PROGRESS_PLAYLIST_SEGMENTS + 50;
    const onDisk = new Set(
      Array.from({ length: n }, (_, i) => `seg_${String(i).padStart(5, "0")}.ts`)
    );
    const raw = manifestForSegs(n);
    expect(countManifestSegments(raw)).toBe(n);
    expect(
      countManifestSegments(prepareManifestForPlayback(raw, false, onDisk))
    ).toBeLessThan(n);
    expect(manifestReferencesMissingOrGappedSegments(raw, onDisk)).toBe(false);
  });

  it("returns true when manifest lists a segment missing from disk", () => {
    const onDisk = new Set(["seg_00000.ts", "seg_00001.ts"]);
    const raw = manifestForSegs(3);
    expect(manifestReferencesMissingOrGappedSegments(raw, onDisk)).toBe(true);
  });

  it("returns true when manifest has a sequence hole", () => {
    const onDisk = new Set([
      "seg_00000.ts",
      "seg_00001.ts",
      "seg_00003.ts",
    ]);
    const raw = [
      "#EXTM3U",
      "#EXTINF:4,",
      "seg_00000.ts",
      "#EXTINF:4,",
      "seg_00001.ts",
      "#EXTINF:4,",
      "seg_00003.ts",
    ].join("\n");
    expect(manifestReferencesMissingOrGappedSegments(raw, onDisk)).toBe(true);
  });
});

/**
 * Odyssey regression: ffmpeg tip-only MEDIA-SEQUENCE jump while full prefix
 * remains on disk. Scrubbing to 45:00 must not land at ~6:00 via a seek job.
 */
describe("tip-only MEDIA-SEQUENCE corruption (Odyssey)", () => {
  function tipOnlyManifest(first: number, last: number): string {
    const lines = [
      "#EXTM3U",
      "#EXT-X-VERSION:6",
      "#EXT-X-TARGETDURATION:4",
      `#EXT-X-MEDIA-SEQUENCE:${first}`,
      "#EXT-X-INDEPENDENT-SEGMENTS",
    ];
    for (let i = first; i <= last; i++) {
      lines.push("#EXTINF:4.000000,", `seg_${String(i).padStart(5, "0")}.ts`);
    }
    lines.push("#EXT-X-ENDLIST");
    return lines.join("\n");
  }

  function diskPrefix(n: number): Set<string> {
    return new Set(
      Array.from({ length: n }, (_, i) => `seg_${String(i).padStart(5, "0")}.ts`)
    );
  }

  it("detects tip-only tails when seg_00000 still exists on disk", () => {
    const onDisk = diskPrefix(1149);
    const tip = tipOnlyManifest(1128, 1148);
    expect(manifestIsTipOnlyTail(tip, onDisk)).toBe(true);
    expect(manifestReferencesMissingOrGappedSegments(tip, onDisk)).toBe(false);
    expect(manifestNeedsContiguityHeal(tip)).toBe(false);
  });

  it("does not flag a healthy from-0 playlist as tip-only", () => {
    const onDisk = diskPrefix(100);
    const raw = tipOnlyManifest(0, 99);
    expect(manifestIsTipOnlyTail(raw, onDisk)).toBe(false);
  });

  it("uses disk floor for coverage when tip playlist lies about ENDLIST", () => {
    const onDisk = diskPrefix(1149);
    const tip = tipOnlyManifest(1128, 1148);
    expect(sumExtinfDurationSec(tip)).toBeLessThan(100);
    expect(
      encodedCoverageSec({
        manifestText: tip,
        onDisk,
        segmentSec: 4,
      })
    ).toBe(1149 * 4);
  });

  it("healed from-disk playlist starts at seg_00000 and covers resume/scrub", () => {
    const onDisk = diskPrefix(1149);
    const tip = tipOnlyManifest(1128, 1148);
    const durationSec = 9934.997;
    const coverage = encodedCoverageSec({
      manifestText: tip,
      onDisk,
      segmentSec: 4,
    });
    // Incomplete movie on disk — not fully complete, but far past 45:00.
    expect(coverage).toBeGreaterThan(2700);
    expect(coverage).toBeLessThan(durationSec * 0.92);

    const healed = buildManifestFromContiguousDisk(
      onDisk,
      new Map(),
      4,
      { playlistComplete: false }
    );
    expect(healed).toContain("MEDIA-SEQUENCE:0");
    expect(healed).toContain("seg_00000.ts");
    expect(healed).not.toContain("MEDIA-SEQUENCE:1128");
    expect(healed).not.toContain("#EXT-X-ENDLIST");

    const prepared = prepareManifestForPlayback(healed, false, onDisk);
    const preparedSec = sumExtinfDurationSec(prepared);
    // Cap must cover well past a 60m tip so long movies don't freeze mid-watch.
    expect(preparedSec).toBeGreaterThanOrEqual(2400);
    expect(preparedSec).toBeGreaterThanOrEqual(2700);
    expect(preparedSec).toBeGreaterThanOrEqual(4500);
    expect(countManifestSegments(prepared)).toBeLessThanOrEqual(
      MAX_IN_PROGRESS_PLAYLIST_SEGMENTS
    );
  });

  it("prefers covering from-0 encode over a mid-film seek job", () => {
    expect(
      shouldReuseTranscodeJobForSeek({
        jobStartOffsetSec: 0,
        encodedSec: 1149 * 4,
        seekSec: 2700,
        procAlive: false,
      })
    ).toBe(true);

    // Seek job at 2340 with tip-only-looking short encoded must NOT win just
    // because quantize buckets match — relative 2700-2340=360 is the 6min snap.
    expect(
      shouldReuseTranscodeJobForSeek({
        jobStartOffsetSec: 2340,
        encodedSec: 84,
        seekSec: 2700,
        procAlive: false,
      })
    ).toBe(false);

    // Even if seek job has deep disk coverage, from-0 still covers — ranking
    // in findReusableTranscodeJob prefers startOffset 0 (+1e9).
    expect(
      shouldReuseTranscodeJobForSeek({
        jobStartOffsetSec: 2340,
        encodedSec: 1113 * 4,
        seekSec: 2700,
        procAlive: false,
      })
    ).toBe(true);
  });

  it("relative scrub into seek@2340 would be 6:00 — document the failure math", () => {
    const seekJobOffset = 2340;
    const scrubAbsolute = 2700;
    expect(scrubAbsolute - seekJobOffset).toBe(360);
  });

  it("in-progress cap is large enough for multi-hour movies", () => {
    // 900 segs ≈ 60m — the tip that froze Odyssey. Cap must be well above that.
    expect(MAX_IN_PROGRESS_PLAYLIST_SEGMENTS).toBeGreaterThan(2000);
    expect(MAX_IN_PROGRESS_PLAYLIST_SEGMENTS * 4).toBeGreaterThan(3 * 3600);
  });

  it("always rebuilds playback playlist from disk so scrub-back works", () => {
    const onDisk = diskPrefix(2114);
    const tip = tipOnlyManifest(2100, 2113);
    // Simulate serve-time rebuild (authoritative path).
    const rebuilt = buildManifestFromContiguousDisk(
      onDisk,
      new Map(),
      4,
      { playlistComplete: false }
    );
    const prepared = prepareManifestForPlayback(rebuilt, false, onDisk);
    expect(prepared).toContain("MEDIA-SEQUENCE:0");
    expect(prepared).toContain("seg_00000.ts");
    expect(prepared).toContain("seg_01000.ts");
    // ~40 min and ~1h33 must both be inside the published playlist.
    expect(sumExtinfDurationSec(prepared)).toBeGreaterThan(40 * 60);
    expect(sumExtinfDurationSec(prepared)).toBeGreaterThan(93 * 60);
    // Tip-only raw must never be what clients seek against.
    expect(manifestIsTipOnlyTail(tip, onDisk)).toBe(true);
    expect(manifestIsTipOnlyTail(prepared, onDisk)).toBe(false);
  });

  it("complete playlists keep ENDLIST and VOD type for scrub-stable reopen", () => {
    const onDisk = diskPrefix(2485);
    const rebuilt = buildManifestFromContiguousDisk(
      onDisk,
      new Map(),
      4,
      { playlistComplete: true }
    );
    const prepared = prepareManifestForPlayback(rebuilt, true, onDisk);
    expect(prepared).toContain("#EXT-X-ENDLIST");
    expect(prepared).toContain("MEDIA-SEQUENCE:0");
    expect(prepared).toContain("seg_00000.ts");
    const prepLines = prepared.split(/\r?\n/);
    expect(prepLines.findIndex((l) => /ENDLIST/i.test(l))).toBeGreaterThan(
      prepLines.findIndex((l) => /seg_00000\.ts/i.test(l))
    );
    const rewritten = rewriteTranscodeManifest(prepared, "http://x/odyssey.mkv", false, {
      durationSec: 9935,
      playlistComplete: true,
      startOffsetSec: 0,
      encodedDurationSec: sumExtinfDurationSec(prepared),
    });
    expect(rewritten).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(rewritten).toContain("#EXT-X-ENDLIST");
    expect(rewritten).not.toContain("tc_seek=");
    const lines = rewritten.split(/\r?\n/);
    const endIdx = lines.findIndex((l) => /ENDLIST/i.test(l));
    const firstSeg = lines.findIndex((l) => /seg_00000\.ts/i.test(l));
    expect(endIdx).toBeGreaterThan(firstSeg);
  });

  it("never emits ENDLIST before media segments (Odyssey empty-VOD bug)", () => {
    const onDisk = diskPrefix(20);
    // Source already has ENDLIST after segs — prepare must not hoist it into header.
    const source = [
      "#EXTM3U",
      "#EXT-X-VERSION:6",
      "#EXT-X-TARGETDURATION:4",
      "#EXT-X-MEDIA-SEQUENCE:0",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      ...Array.from({ length: 20 }, (_, i) => [
        "#EXTINF:4.000000,",
        `seg_${String(i).padStart(5, "0")}.ts`,
      ]).flat(),
      "#EXT-X-ENDLIST",
    ].join("\n");
    const prepared = prepareManifestForPlayback(source, true, onDisk);
    const lines = prepared.split(/\r?\n/);
    const endIdx = lines.findIndex((l) => /#EXT-X-ENDLIST/i.test(l));
    const firstSeg = lines.findIndex((l) => /seg_\d+\.ts/i.test(l));
    expect(firstSeg).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(firstSeg);
    expect(lines.filter((l) => /#EXT-X-ENDLIST/i.test(l))).toHaveLength(1);
    // Nothing after a premature ENDLIST should be required — segs must precede it.
    expect(
      lines.slice(0, endIdx).some((l) => /seg_\d+\.ts/i.test(l))
    ).toBe(true);
  });
});

describe("encodedLooksFullyComplete", () => {
  it("never completes when duration is unknown", () => {
    expect(encodedLooksFullyComplete(900, null)).toBe(false);
    expect(encodedLooksFullyComplete(900, undefined)).toBe(false);
    expect(encodedLooksFullyComplete(900, 0)).toBe(false);
  });

  it("requires the encode to reach within 45s of known duration", () => {
    // Old 92% floor (~9139s) falsely completed Odyssey ~8–20 min early.
    expect(encodedLooksFullyComplete(9200, 9935)).toBe(false);
    expect(encodedLooksFullyComplete(9459, 9935)).toBe(false);
    expect(encodedLooksFullyComplete(9890, 9935)).toBe(true);
    expect(encodedLooksFullyComplete(9935, 9935)).toBe(true);
  });
});
