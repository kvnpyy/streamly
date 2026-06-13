import { describe, expect, it, vi } from "vitest";
import {
  appendVodTranscodeHls,
  buildVodTranscodeRetryUrl,
  canVodTranscodeProxyUrl,
  inferVodContainerExtFromProxyUrl,
  playbackUrlUsesVodTranscode,
  releaseVodTranscodePlayback,
  resolveVodPlaybackUrl,
  stripVodTranscodeParams,
  vodNeedsServerTranscodePrep,
  vodTranscodeBaseProxyUrl,
} from "./vod-transcode-url";

describe("vod-transcode-url", () => {
  const base =
    "/api/stream?u=" +
    encodeURIComponent("http://panel.example/movie/user/pass/99.mkv") +
    "&type=vod";

  it("appends transcode=hls and optional compat", () => {
    const out = appendVodTranscodeHls(base, { compatMse: true });
    expect(out).toContain("transcode=hls");
    expect(out).toContain("compat=mse");
    expect(playbackUrlUsesVodTranscode(out)).toBe(true);
  });

  it("strips transcode params and rebuilds retry URL with tc_reset", () => {
    const transcoded = appendVodTranscodeHls(base, { compatMse: true });
    expect(stripVodTranscodeParams(transcoded)).not.toContain("transcode=");
    expect(vodTranscodeBaseProxyUrl(transcoded)).toBe(base);
    const retry = buildVodTranscodeRetryUrl(transcoded, base, { compatMse: true });
    expect(retry).toContain("tc_reset=");
    expect(retry).toContain("transcode=hls");
  });

  it("allows movie/series proxied vod", () => {
    expect(canVodTranscodeProxyUrl(base)).toBe(true);
    expect(
      canVodTranscodeProxyUrl(
        "/api/stream?u=" +
          encodeURIComponent("http://panel.example/live/u/p/1.m3u8") +
          "&type=hls"
      )
    ).toBe(false);
  });

  it("infers MKV from upstream URL when panel metadata says mp4", () => {
    const series =
      "/api/stream?u=" +
      encodeURIComponent(
        "http://omentv.co.in/series/ca6517ba/fb549b89/1358214.mkv"
      ) +
      "&type=vod";
    expect(inferVodContainerExtFromProxyUrl(series, "mp4")).toBe("mkv");
    expect(vodNeedsServerTranscodePrep("mp4", series)).toBe(true);
  });

  it("releaseVodTranscodePlayback beacons transcode=release for upstream", () => {
    vi.stubEnv("NEXT_PUBLIC_VOD_TRANSCODE", "1");
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("window", {
      location: { origin: "http://localhost" },
    });
    vi.stubGlobal("navigator", { sendBeacon: beacon });
    const transcoded = appendVodTranscodeHls(base);
    releaseVodTranscodePlayback(transcoded);
    expect(beacon).toHaveBeenCalledTimes(1);
    const [url] = beacon.mock.calls[0] as [string, string];
    expect(url).toContain("transcode=release");
    expect(url).toContain("u=");
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("resolveVodPlaybackUrl upgrades risky series to transcode=hls", () => {
    vi.stubEnv("NEXT_PUBLIC_VOD_TRANSCODE", "1");
    const series =
      "/api/stream?u=" +
      encodeURIComponent(
        "http://omentv.co.in/series/ca6517ba/fb549b89/1358214.mkv"
      ) +
      "&type=vod";
    const out = resolveVodPlaybackUrl(null, series, {
      containerExt: "mp4",
      kindIsLive: false,
    });
    expect(out).toContain("transcode=hls");
    vi.unstubAllEnvs();
  });
});
