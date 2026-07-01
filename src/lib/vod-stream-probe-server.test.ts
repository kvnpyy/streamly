import { describe, expect, it } from "vitest";
import { browserFriendlyVodSnippet } from "@/lib/vod-stream-probe-server";

describe("browserFriendlyVodSnippet", () => {
  it("detects mp4 ftyp", () => {
    const buf = new Uint8Array(12);
    buf.set([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70]);
    expect(browserFriendlyVodSnippet(buf)).toBe(true);
  });

  it("detects mpeg-ts sync byte", () => {
    expect(browserFriendlyVodSnippet(new Uint8Array([0x47, 0x00, 0x00, 0x00]))).toBe(
      true
    );
  });

  it("rejects empty payloads", () => {
    expect(browserFriendlyVodSnippet(new Uint8Array([0, 0, 0]))).toBe(false);
  });
});
