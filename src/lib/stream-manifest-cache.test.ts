import { describe, expect, it } from "vitest";
import {
  clearManifestCache,
  getCachedManifest,
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
});
