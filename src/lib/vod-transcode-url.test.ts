import { describe, expect, it } from "vitest";
import {
  appendVodTranscodeHls,
  buildVodTranscodeRetryUrl,
  canVodTranscodeProxyUrl,
  playbackUrlUsesVodTranscode,
  stripVodTranscodeParams,
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
});
