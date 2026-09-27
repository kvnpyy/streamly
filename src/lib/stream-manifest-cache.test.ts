import { describe, expect, it } from "vitest";
import {
  clearManifestCache,
  getCachedManifest,
  liveHlsManifestCacheTtlMs,
  manifestCacheKey,
  setCachedManifest,
} from "./stream-manifest-cache";

describe("stream-manifest-cache", () => {
  it("returns cached body within TTL", () => {
    clearManifestCache();
    const key = manifestCacheKey({
      upstream: "https://cdn.example/live.m3u8",
      compatMse: true,
      forCast: false,
    });
    setCachedManifest(key, "#EXTM3U\n", 5000, 1000);
    expect(getCachedManifest(key, 2000)).toBe("#EXTM3U\n");
    expect(getCachedManifest(key, 7000)).toBeNull();
  });

  it("does not cache media playlists whose target duration is 2s or less", () => {
    const short = "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.0,\nseg.ts\n";
    const longer = "#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4.0,\nseg.ts\n";
    const master =
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nlevel.m3u8\n";
    expect(liveHlsManifestCacheTtlMs(short)).toBeNull();
    expect(liveHlsManifestCacheTtlMs(longer)).toBe(3_500);
    expect(liveHlsManifestCacheTtlMs(master)).toBe(3_500);
  });
});
