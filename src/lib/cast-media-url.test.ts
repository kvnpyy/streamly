import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  appendCastStreamQuery,
  buildCastMediaDescriptor,
  sanitizeProxyUrlForCast,
  toAbsoluteAppUrl,
} from "./cast-media-url";
import type { PlayerSource } from "@/store/player";

describe("cast-media-url", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_VOD_TRANSCODE", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const movie: PlayerSource = {
    kind: "movie",
    id: 99,
    title: "Test",
    url:
      "/api/stream?u=" +
      encodeURIComponent("http://panel.example/movie/u/p/99.mkv") +
      "&type=vod",
    containerExt: "mkv",
  };

  it("builds absolute proxied URLs with cast=1", () => {
    const d = buildCastMediaDescriptor({
      origin: "https://app.example",
      current: movie,
      isLive: false,
      proxyPlaybackUrl: movie.url,
    });
    expect(d).not.toBeNull();
    expect(d!.url).toMatch(/^https:\/\/app\.example\/api\/stream/);
    expect(d!.url).toContain("cast=1");
    expect(d!.url).toContain("transcode=hls");
    expect(d!.url).not.toContain("compat=mse");
    expect(d!.contentType).toBe("application/x-mpegURL");
    expect(d!.streamType).toBe("live");
  });

  it("strips compat=mse from active transcode playback URLs", () => {
    const transcodeUrl =
      "/api/stream?u=" +
      encodeURIComponent("http://panel.example/movie/u/p/99.mkv") +
      "&type=vod&transcode=hls&compat=mse";
    const d = buildCastMediaDescriptor({
      origin: "https://app.example",
      current: movie,
      isLive: false,
      proxyPlaybackUrl: transcodeUrl,
      seekSec: 120,
    });
    expect(d!.url).toContain("cast=1");
    expect(d!.url).toContain("tc_seek=120");
    expect(d!.url).not.toContain("compat=mse");
    expect(d!.streamType).toBe("live");
  });

  it("uses live HLS proxy for channels", () => {
    const live: PlayerSource = {
      kind: "live",
      id: 1,
      title: "News",
      url:
        "/api/stream?u=" +
        encodeURIComponent("http://panel.example/live/u/p/1.m3u8") +
        "&type=hls",
    };
    const d = buildCastMediaDescriptor({
      origin: "https://app.example",
      current: live,
      isLive: true,
      proxyPlaybackUrl: live.url,
    });
    expect(d!.streamType).toBe("live");
    expect(d!.contentType).toBe("application/vnd.apple.mpegurl");
    expect(d!.url).toContain("cast=1");
  });

  it("toAbsoluteAppUrl, sanitizeProxyUrlForCast, appendCastStreamQuery", () => {
    expect(toAbsoluteAppUrl("https://x.com", "/api/stream?a=1")).toBe(
      "https://x.com/api/stream?a=1"
    );
    expect(
      sanitizeProxyUrlForCast(
        "/api/stream?u=1&type=vod&transcode=hls&compat=mse",
        "https://x.com"
      )
    ).not.toContain("compat=mse");
    expect(appendCastStreamQuery("https://x.com/api/stream?u=1")).toContain(
      "cast=1"
    );
  });
});
