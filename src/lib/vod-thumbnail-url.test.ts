import { describe, expect, it } from "vitest";
import {
  bucketSeekPreviewSec,
  buildVodSeekPreviewUrl,
  upstreamFromPlaybackProxyUrl,
} from "./vod-thumbnail-url";

describe("vod-thumbnail-url", () => {
  it("extracts upstream from proxied playback URL", () => {
    const u = upstreamFromPlaybackProxyUrl(
      "/api/stream?u=http%3A%2F%2Fpanel.example%2Fseries%2Fu%2Fp%2F1.mkv&type=vod&transcode=hls"
    );
    expect(u).toBe("http://panel.example/series/u/p/1.mkv");
  });

  it("buckets preview timestamps", () => {
    expect(bucketSeekPreviewSec(0)).toBe(0);
    expect(bucketSeekPreviewSec(7)).toBe(0);
    expect(bucketSeekPreviewSec(8)).toBe(8);
    expect(bucketSeekPreviewSec(15)).toBe(8);
  });

  it("builds thumbnail API URL", () => {
    expect(buildVodSeekPreviewUrl("http://x/m.mkv", 12)).toBe(
      "/api/vod/thumbnail?u=http%3A%2F%2Fx%2Fm.mkv&t=8"
    );
  });
});
