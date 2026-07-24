import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fsp from "fs/promises";
import os from "os";
import path from "path";

vi.mock("server-only", () => ({}));

describe("vod-source-cache", () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await fsp.mkdtemp(path.join(os.tmpdir(), "vod-source-"));
    process.env.STREAM_VOD_TRANSCODE = "1";
    process.env.STREAM_VOD_SOURCE_CACHE = "1";
    process.env.STREAM_VOD_SOURCE_DIR = tmp;
    process.env.STREAM_VOD_SOURCE_START_BYTES = "1000";
    vi.resetModules();
  });

  afterEach(async () => {
    const mod = await import("./vod-source-cache");
    mod._resetVodSourceCacheForTests();
    await fsp.rm(tmp, { recursive: true, force: true });
    vi.unstubAllGlobals();
    delete process.env.STREAM_VOD_SOURCE_DIR;
    delete process.env.STREAM_VOD_SOURCE_START_BYTES;
  });

  it("is enabled when STREAM_VOD_TRANSCODE=1 by default", async () => {
    delete process.env.STREAM_VOD_SOURCE_CACHE;
    process.env.STREAM_VOD_TRANSCODE = "1";
    vi.resetModules();
    const { isVodSourceCacheEnabled } = await import("./vod-source-cache");
    expect(isVodSourceCacheEnabled()).toBe(true);
  });

  it("can be disabled with STREAM_VOD_SOURCE_CACHE=0", async () => {
    process.env.STREAM_VOD_SOURCE_CACHE = "0";
    vi.resetModules();
    const { isVodSourceCacheEnabled } = await import("./vod-source-cache");
    expect(isVodSourceCacheEnabled()).toBe(false);
  });

  it("estimates more bytes for deeper seeks", async () => {
    const { estimateBytesForSeekSec, vodSourceStartBytes } = await import(
      "./vod-source-cache"
    );
    expect(estimateBytesForSeekSec(0)).toBe(vodSourceStartBytes());
    expect(estimateBytesForSeekSec(600)).toBeGreaterThan(
      estimateBytesForSeekSec(60)
    );
    const withMeta = estimateBytesForSeekSec(600, {
      totalBytes: 1_000_000_000,
      durationSec: 3600,
    });
    // 660s of a 1GB/3600s file ≈ 183MB
    expect(withMeta).toBeGreaterThan(150_000_000);
    expect(withMeta).toBeLessThan(250_000_000);
  });

  it("downloads upstream to a local file and reports progress", async () => {
    const body = new Uint8Array(2500).fill(7);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({
          "content-length": String(body.byteLength),
        }),
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(body);
            controller.close();
          },
        }),
      })
    );

    const {
      waitForVodSourceBytes,
      getVodSourceStatus,
      vodSourceCacheKey,
    } = await import("./vod-source-cache");

    const upstream = "http://provider.example/series/ep1.mkv";
    const status = await waitForVodSourceBytes(upstream, 1000, {
      timeoutMs: 10_000,
    });
    expect(status.bytes).toBeGreaterThanOrEqual(1000);
    expect(status.complete).toBe(true);
    expect(status.pct).toBe(100);

    const key = vodSourceCacheKey(upstream);
    const finalPath = path.join(tmp, `${key}.bin`);
    const st = await fsp.stat(finalPath);
    expect(st.size).toBe(2500);

    const again = await getVodSourceStatus(upstream);
    expect(again?.complete).toBe(true);
    expect(again?.path).toBe(finalPath);
  });

  it("resumes a partial download with Range", async () => {
    const keyMod = await import("./vod-source-cache");
    const upstream = "http://provider.example/movie.mkv";
    const key = keyMod.vodSourceCacheKey(upstream);
    const partial = path.join(tmp, `${key}.partial`);
    await fsp.writeFile(partial, Buffer.alloc(500, 1));

    const rest = new Uint8Array(500).fill(2);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 206,
      headers: new Headers({
        "content-range": "bytes 500-999/1000",
        "content-length": "500",
      }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(rest);
          controller.close();
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    vi.resetModules();
    process.env.STREAM_VOD_SOURCE_DIR = tmp;
    process.env.STREAM_VOD_SOURCE_CACHE = "1";
    process.env.STREAM_VOD_TRANSCODE = "1";

    const { waitForVodSourceBytes } = await import("./vod-source-cache");
    const status = await waitForVodSourceBytes(upstream, 1000, {
      timeoutMs: 10_000,
    });
    expect(status.complete).toBe(true);
    expect(status.bytes).toBe(1000);
    expect(fetchMock).toHaveBeenCalled();
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(String((init.headers as Record<string, string>).Range)).toBe(
      "bytes=500-"
    );
  });
});
