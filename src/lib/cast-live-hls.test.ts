import { describe, expect, it } from "vitest";
import {
  isLiveHlsMasterPlaylist,
  pickChromecastLiveVariant,
  resolveVariantUrl,
} from "./cast-live-hls";

describe("pickChromecastLiveVariant", () => {
  it("prefers H.264 over HEVC", () => {
    const picked = pickChromecastLiveVariant([
      {
        inf: '#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="hvc1.1.6.L120.90"',
        uri: "https://cdn/hevc.m3u8",
      },
      {
        inf: '#EXT-X-STREAM-INF:BANDWIDTH=2800000,CODECS="avc1.4d401f,mp4a.40.2"',
        uri: "https://cdn/h264.m3u8",
      },
    ]);
    expect(picked?.uri).toContain("h264");
  });

  it("rejects a single HEVC-only ladder", () => {
    const picked = pickChromecastLiveVariant([
      {
        inf: '#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="hvc1.1.6.L120.90"',
        uri: "https://cdn/hevc.m3u8",
      },
    ]);
    expect(picked).toBeNull();
  });
});

describe("resolveVariantUrl", () => {
  it("resolves relative variant URIs against the cast manifest", () => {
    expect(
      resolveVariantUrl(
        "/api/stream?u=x&type=hls&cast=1",
        "https://app.example/api/stream?u=master&type=hls&cast=1"
      )
    ).toBe("https://app.example/api/stream?u=x&type=hls&cast=1");
  });
});

describe("isLiveHlsMasterPlaylist", () => {
  it("detects master playlists", () => {
    expect(
      isLiveHlsMasterPlaylist(
        "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nchunk.m3u8\n"
      )
    ).toBe(true);
    expect(
      isLiveHlsMasterPlaylist("#EXTM3U\n#EXTINF:6,\nseg.ts\n")
    ).toBe(false);
  });
});
