import { describe, expect, it } from "vitest";
import {
  appendStreamCompatMse,
  extractStreamProxyUpstream,
  streamProxyTypeIsHls,
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
});
