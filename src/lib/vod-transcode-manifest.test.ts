import { describe, expect, it } from "vitest";
import {
  buildManifestFromContiguousDisk,
  contiguousSegmentCount,
  countManifestSegments,
  hasOrphanSegmentsBeyondPrefix,
  manifestReferencesMissingOrGappedSegments,
  MAX_IN_PROGRESS_PLAYLIST_SEGMENTS,
  parseStreamlyDurationSec,
  prepareManifestForPlayback,
  rewriteTranscodeManifest,
  trimContiguousSegmentsFromStart,
} from "./vod-transcode-manifest";

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
    expect(uriCount).toBe(MAX_IN_PROGRESS_PLAYLIST_SEGMENTS);
    expect(out).toContain("seg_00000.ts");
    expect(out).not.toContain(`seg_${String(total - 1).padStart(5, "0")}.ts`);
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
    expect(uriCount).toBe(6);
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
