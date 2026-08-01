import { describe, expect, it } from "vitest";
import {
  MAX_HLS_MANIFEST_BYTES,
  ResponseBodyTooLargeError,
  readResponseBytesLimited,
  readResponseTextLimited,
} from "./read-response-text-limited";

function streamOf(chunks: Uint8Array[]): ReadableStream<Uint8Array> {
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(chunks[i]!);
      i += 1;
    },
  });
}

describe("readResponseTextLimited", () => {
  it("reads a small UTF-8 body", async () => {
    const res = new Response("#EXTM3U\n#EXTINF:1,\nseg.ts\n", {
      headers: { "content-type": "application/vnd.apple.mpegurl" },
    });
    await expect(readResponseTextLimited(res, MAX_HLS_MANIFEST_BYTES)).resolves.toContain(
      "#EXTM3U"
    );
  });

  it("rejects when Content-Length exceeds the cap without buffering", async () => {
    const res = new Response("ignored", {
      headers: { "content-length": String(MAX_HLS_MANIFEST_BYTES + 1) },
    });
    await expect(readResponseTextLimited(res, MAX_HLS_MANIFEST_BYTES)).rejects.toBeInstanceOf(
      ResponseBodyTooLargeError
    );
  });

  it("rejects when streamed chunks exceed the cap", async () => {
    const chunk = new Uint8Array(1024).fill(0x41);
    const res = new Response(streamOf([chunk, chunk, chunk]), {
      headers: { "content-type": "text/plain" },
    });
    await expect(readResponseTextLimited(res, 2000)).rejects.toBeInstanceOf(
      ResponseBodyTooLargeError
    );
  });

  it("returns empty string for a bodyless response", async () => {
    const res = new Response(null, { status: 204 });
    await expect(readResponseTextLimited(res, 100)).resolves.toBe("");
  });
});

describe("readResponseBytesLimited", () => {
  it("concatenates multiple chunks under the cap", async () => {
    const a = new Uint8Array([1, 2]);
    const b = new Uint8Array([3, 4, 5]);
    const res = new Response(streamOf([a, b]));
    const out = await readResponseBytesLimited(res, 16);
    expect(Array.from(out)).toEqual([1, 2, 3, 4, 5]);
  });
});
