import { afterEach, describe, expect, it, vi } from "vitest";
import { validateVodUpstreamReadable } from "./vod-transcode-upstream";

describe("validateVodUpstreamReadable", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts MKV magic bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () =>
          new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]).buffer,
      })
    );
    await expect(
      validateVodUpstreamReadable("http://example.com/a.mkv")
    ).resolves.toBeNull();
  });

  it("rejects empty provider body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(0),
      })
    );
    await expect(
      validateVodUpstreamReadable("http://example.com/a.mkv")
    ).resolves.toMatch(/empty response/i);
  });
});
