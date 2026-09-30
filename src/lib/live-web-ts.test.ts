import { describe, expect, it } from "vitest";
import {
  isPhoneLiveClient,
  liveMpegtsFailureAction,
  playbackUrlUsesLiveMpegts,
  withLiveMpegtsProxy,
  xtreamLiveUpstreamToWebTs,
} from "./live-web-ts";

describe("xtreamLiveUpstreamToWebTs", () => {
  it("rewrites an Xtream m3u8 live URL to raw TS with player=web", () => {
    expect(
      xtreamLiveUpstreamToWebTs("http://panel.example/live/u/p/123.m3u8")
    ).toBe("http://panel.example/live/u/p/123.ts?player=web");
  });

  it("appends .ts when the live id has no extension", () => {
    expect(
      xtreamLiveUpstreamToWebTs("http://panel.example/live/u/p/123")
    ).toBe("http://panel.example/live/u/p/123.ts?player=web");
  });

  it("keeps an existing .ts path and sets player=web", () => {
    expect(
      xtreamLiveUpstreamToWebTs("https://panel.example/live/u/p/9.ts")
    ).toBe("https://panel.example/live/u/p/9.ts?player=web");
  });

  it("leaves direct files and non-live paths alone", () => {
    expect(
      xtreamLiveUpstreamToWebTs("http://cdn.example/movie/1.mp4")
    ).toBeNull();
    expect(
      xtreamLiveUpstreamToWebTs("http://cdn.example/hls/index.m3u8")
    ).toBeNull();
  });
});

describe("withLiveMpegtsProxy", () => {
  it("points the proxy at the raw TS and drops HLS compat flags", () => {
    const base =
      "/api/stream?u=" +
      encodeURIComponent("http://panel.example/live/u/p/1.m3u8") +
      "&type=hls&compat=mse";
    const next = withLiveMpegtsProxy(base);
    expect(next).toContain("type=mpegts");
    expect(next).not.toContain("compat=mse");
    expect(next).not.toContain("type=hls");
    expect(playbackUrlUsesLiveMpegts(next!)).toBe(true);
    const upstream = new URL(next!, "https://localhost").searchParams.get("u");
    expect(upstream).toBe("http://panel.example/live/u/p/1.ts?player=web");
  });

  it("returns null when the upstream is not an Xtream live path", () => {
    const base =
      "/api/stream?u=" +
      encodeURIComponent("https://cdn.example/live.m3u8") +
      "&type=hls";
    expect(withLiveMpegtsProxy(base)).toBeNull();
  });
});

describe("isPhoneLiveClient", () => {
  it("includes iPhone and Android phones, including landscape width", () => {
    expect(
      isPhoneLiveClient({
        appleMobile: true,
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
        narrowViewport: false,
        tv: false,
        silk: false,
      })
    ).toBe(true);
    expect(
      isPhoneLiveClient({
        appleMobile: false,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
        narrowViewport: false,
        tv: false,
        silk: false,
      })
    ).toBe(true);
  });

  it("excludes desktop, TV, and Silk", () => {
    expect(
      isPhoneLiveClient({
        appleMobile: false,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36",
        narrowViewport: true,
        tv: false,
        silk: false,
      })
    ).toBe(false);
    expect(
      isPhoneLiveClient({
        appleMobile: false,
        userAgent: "Mozilla/5.0 (SMART-TV; Tizen) AppleWebKit/537.36",
        narrowViewport: true,
        tv: true,
        silk: false,
      })
    ).toBe(false);
    expect(
      isPhoneLiveClient({
        appleMobile: false,
        userAgent: "Mozilla/5.0 (Linux; Android) Silk/120",
        narrowViewport: true,
        tv: false,
        silk: true,
      })
    ).toBe(false);
  });
});

describe("liveMpegtsFailureAction", () => {
  it("sends Android codec failures to the server encoder", () => {
    expect(liveMpegtsFailureAction("MediaMSEError", false)).toBe("transcode");
    expect(liveMpegtsFailureAction("CodecUnsupported", false)).toBe(
      "transcode"
    );
  });

  it("lets iPhone try native HLS before encoding", () => {
    expect(liveMpegtsFailureAction("MediaMSEError", true)).toBe("hls");
    expect(liveMpegtsFailureAction("CodecUnsupported", true)).toBe("hls");
  });

  it("falls back to the playlist when the response is not MPEG-TS", () => {
    expect(liveMpegtsFailureAction("FormatUnsupported", false)).toBe("hls");
    expect(liveMpegtsFailureAction("HttpStatusCodeInvalid", false)).toBe(
      "hls"
    );
    expect(liveMpegtsFailureAction("FormatError", true)).toBe("hls");
  });
});
