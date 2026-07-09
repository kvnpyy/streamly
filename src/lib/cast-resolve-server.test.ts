import { describe, expect, it, vi } from "vitest";
import {
  isSameOriginStreamProxyUrl,
  resolveLiveCastPlayUrlServer,
} from "./cast-resolve-server";

describe("isSameOriginStreamProxyUrl", () => {
  it("accepts same-origin /api/stream", () => {
    expect(
      isSameOriginStreamProxyUrl(
        "https://app.example/api/stream?u=1&type=hls&cast=1",
        "https://app.example"
      )
    ).toBe(true);
  });

  it("rejects other origins", () => {
    expect(
      isSameOriginStreamProxyUrl(
        "https://evil.example/api/stream?u=1",
        "https://app.example"
      )
    ).toBe(false);
  });
});

describe("resolveLiveCastPlayUrlServer", () => {
  it("returns media playlist URL unchanged", async () => {
    const mediaUrl =
      "https://app.example/api/stream?u=media&type=hls&cast=1";
    const fetchImpl = vi.fn(async () =>
      new Response("#EXTM3U\n#EXTINF:6,\nseg.ts\n", { status: 200 })
    );
    const playUrl = await resolveLiveCastPlayUrlServer(mediaUrl, {
      origin: "https://app.example",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(playUrl).toContain("cast=1");
    expect(playUrl).toContain("u=media");
  });

  it("walks master to H.264 variant", async () => {
    const master =
      "https://app.example/api/stream?u=master&type=hls&cast=1";
    const variant =
      "https://app.example/api/stream?u=h264&type=hls&cast=1";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("u=master")) {
        return new Response(
          [
            "#EXTM3U",
            '#EXT-X-STREAM-INF:BANDWIDTH=5000000,CODECS="hvc1.1.6.L120.90"',
            "https://app.example/api/stream?u=hevc&type=hls&cast=1",
            '#EXT-X-STREAM-INF:BANDWIDTH=2800000,CODECS="avc1.4d401f,mp4a.40.2"',
            variant,
          ].join("\n"),
          { status: 200 }
        );
      }
      return new Response("#EXTM3U\n#EXTINF:6,\nseg.ts\n", { status: 200 });
    });
    const playUrl = await resolveLiveCastPlayUrlServer(master, {
      origin: "https://app.example",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(playUrl).toContain("u=h264");
    expect(playUrl).toContain("cast=1");
  });

  it("rejects non-proxy URLs", async () => {
    await expect(
      resolveLiveCastPlayUrlServer("https://cdn.example/live.m3u8", {
        origin: "https://app.example",
      })
    ).rejects.toThrow(/same-origin/);
  });
});
