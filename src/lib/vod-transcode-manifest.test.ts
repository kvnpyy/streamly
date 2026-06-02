import { describe, expect, it } from "vitest";
import {
  MAX_IN_PROGRESS_PLAYLIST_SEGMENTS,
  parseStreamlyDurationSec,
  prepareManifestForPlayback,
  rewriteTranscodeManifest,
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

  it("trims in-progress playlists and strips discontinuity", () => {
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
    expect(out).not.toContain("#EXT-X-DISCONTINUITY");
    const uriCount = out.split("\n").filter((l) => /seg_\d+\.ts/i.test(l)).length;
    expect(uriCount).toBe(MAX_IN_PROGRESS_PLAYLIST_SEGMENTS);
    expect(out).toContain(`seg_${String(total - 1).padStart(5, "0")}.ts`);
    expect(out).not.toContain("seg_00000.ts");
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
    expect(out).toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(out).toContain("#EXT-X-STREAMLY-START-OFFSET-SEC:120");
    expect(out).toContain("#EXT-X-STREAMLY-ENCODED-DURATION-SEC:");
    expect(out).toContain("tc_seek=120");
    expect(parseStreamlyDurationSec(out)).toBeNull();
    const inProgress = rewriteTranscodeManifest(raw, "http://x/m.mkv", false, {
      durationSec: 7200.5,
      playlistComplete: false,
    });
    expect(inProgress).not.toContain("#EXT-X-PLAYLIST-TYPE:VOD");
    expect(parseStreamlyDurationSec(inProgress)).toBeNull();
  });
});
