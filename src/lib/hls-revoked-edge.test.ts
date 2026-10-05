import { afterEach, describe, expect, it, vi } from "vitest";
import {
  hostRevokesStaleSegments,
  isRevokedTokenPayload,
  noteRevokedSegmentHost,
  resetRevokedSegmentHostsForTests,
  trimLiveMediaPlaylistToEdge,
} from "./hls-revoked-edge";

afterEach(() => {
  resetRevokedSegmentHostsForTests();
  vi.restoreAllMocks();
});

describe("isRevokedTokenPayload", () => {
  it("matches the CDN revoked JSON and ignores other bodies", () => {
    expect(isRevokedTokenPayload('{"message":"revoked"}')).toBe(true);
    expect(isRevokedTokenPayload('  {"message":"revoked"}\n')).toBe(true);
    expect(isRevokedTokenPayload('{"message":"expired"}')).toBe(false);
    expect(isRevokedTokenPayload("revoked")).toBe(false);
    expect(isRevokedTokenPayload("<html>revoked</html>")).toBe(false);
  });
});

describe("revoked segment hosts", () => {
  it("remembers a host until the mark expires", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(noteRevokedSegmentHost("CDN.Example", 1_000)).toBe(true);
    expect(noteRevokedSegmentHost("cdn.example", 2_000)).toBe(false);
    expect(hostRevokesStaleSegments("cdn.example", 2_000)).toBe(true);
    expect(hostRevokesStaleSegments("cdn.example", 2_000 + 10 * 60_000)).toBe(
      false
    );
  });
});

describe("trimLiveMediaPlaylistToEdge", () => {
  const live = [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:6",
    "#EXT-X-MEDIA-SEQUENCE:100",
    '#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example/key"',
    "#EXTINF:6.0,",
    "https://cdn.example/100.ts",
    "#EXT-X-DISCONTINUITY",
    "#EXTINF:6.0,",
    "https://cdn.example/101.ts",
    "#EXTINF:6.0,",
    "https://cdn.example/102.ts",
    "#EXTINF:6.0,",
    "https://cdn.example/103.ts",
    "#EXTINF:6.0,",
    "https://cdn.example/104.ts",
    "",
  ].join("\n");

  it("keeps the live edge and advances the media sequence", () => {
    const trimmed = trimLiveMediaPlaylistToEdge(live, 3);
    expect(trimmed).toContain("#EXT-X-MEDIA-SEQUENCE:102");
    expect(trimmed).not.toContain("100.ts");
    expect(trimmed).not.toContain("101.ts");
    expect(trimmed).toContain("102.ts");
    expect(trimmed).toContain("104.ts");
    expect(trimmed).toContain("#EXT-X-DISCONTINUITY-SEQUENCE:1");
    expect(trimmed).toContain('#EXT-X-KEY:METHOD=AES-128,URI="https://cdn.example/key"');
    expect(trimmed.match(/#EXTINF:/g)).toHaveLength(3);
  });

  it("leaves masters, VOD, and short live playlists alone", () => {
    const master =
      "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nhttps://cdn.example/a.m3u8\n";
    const vod = "#EXTM3U\n#EXT-X-ENDLIST\n#EXTINF:4,\na.ts\n#EXTINF:4,\nb.ts\n";
    const short = "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:1\n#EXTINF:4,\na.ts\n";
    expect(trimLiveMediaPlaylistToEdge(master, 1)).toBe(master);
    expect(trimLiveMediaPlaylistToEdge(vod, 1)).toBe(vod);
    expect(trimLiveMediaPlaylistToEdge(short, 3)).toBe(short);
  });
});
