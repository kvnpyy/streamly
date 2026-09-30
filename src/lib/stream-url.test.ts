import { describe, expect, it } from "vitest";
import {
  appendStreamCompatMse,
  extractStreamProxyUpstream,
  streamProxyTypeIsHls,
  playbackUrlUsesLiveBrowserTranscode,
  playbackUrlUsesLiveRemux,
  withLiveBrowserTranscode,
  withLiveCopyRemux,
  withLiveHlsCompatMse,
} from "./stream-url";

describe("stream-url", () => {
  it("appends compat=mse to live hls proxy urls", () => {
    const base =
      "/api/stream?u=https%3A%2F%2Fpanel.example%2Flive%2Fu%2Fp%2F1.m3u8&type=hls";
    expect(withLiveHlsCompatMse(base, true)).toContain("compat=mse");
    expect(withLiveHlsCompatMse(base, false)).toBe(base);
  });

  it("does not double-append compat", () => {
    const once = appendStreamCompatMse(
      "/api/stream?u=x&type=hls"
    );
    expect(once).toContain("compat=mse");
    expect(appendStreamCompatMse(once)).toBe(once);
  });

  it("detects hls proxy type", () => {
    expect(streamProxyTypeIsHls("/api/stream?u=x&type=hls")).toBe(true);
    expect(streamProxyTypeIsHls("/api/stream?u=x&type=vod")).toBe(false);
  });

  it("extracts the upstream URL from a proxy playback URL", () => {
    const upstream = "http://panel.example/live/u/p/1.m3u8";
    expect(
      extractStreamProxyUpstream(
        `/api/stream?u=${encodeURIComponent(upstream)}&type=hls`
      )
    ).toBe(upstream);
    expect(extractStreamProxyUpstream("https://cdn.example/1.m3u8")).toBeNull();
    expect(extractStreamProxyUpstream("/api/stream?type=hls")).toBeNull();
  });

  it("marks a live proxy URL for copy remux without dropping the upstream", () => {
    const base =
      "/api/stream?u=https%3A%2F%2Fpanel.example%2Flive.m3u8&type=hls";
    const remux = withLiveCopyRemux(base);
    expect(remux).toContain("remux=copy");
    expect(remux).toContain("type=hls");
    expect(extractStreamProxyUpstream(remux)).toBe(
      "https://panel.example/live.m3u8"
    );
    expect(playbackUrlUsesLiveRemux(remux!)).toBe(true);
    expect(playbackUrlUsesLiveRemux(base)).toBe(false);
    expect(withLiveCopyRemux("https://cdn.example/live.m3u8")).toBeNull();
  });

  it("marks a live proxy URL for browser transcode and drops compat", () => {
    const base =
      "/api/stream?u=https%3A%2F%2Fpanel.example%2Flive.m3u8&type=hls&compat=mse";
    const next = withLiveBrowserTranscode(base);
    expect(next).toContain("remux=browser");
    expect(next).not.toContain("compat=mse");
    expect(extractStreamProxyUpstream(next)).toBe(
      "https://panel.example/live.m3u8"
    );
    expect(playbackUrlUsesLiveBrowserTranscode(next!)).toBe(true);
    expect(playbackUrlUsesLiveRemux(next!)).toBe(false);
    expect(withLiveBrowserTranscode("https://cdn.example/live.m3u8")).toBeNull();
  });
});
