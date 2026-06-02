import { describe, expect, it } from "vitest";
import { isChunkLoadFailure } from "./chunk-load-recovery";

describe("isChunkLoadFailure", () => {
  it("detects ChunkLoadError by name", () => {
    expect(
      isChunkLoadFailure(
        Object.assign(new Error("Failed to load chunk /_next/static/chunks/x.js"), {
          name: "ChunkLoadError",
        })
      )
    ).toBe(true);
  });

  it("detects turbopack chunk messages", () => {
    expect(
      isChunkLoadFailure(
        "Failed to load chunk /_next/static/chunks/1049y4t30bfx5.js from module 964893"
      )
    ).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isChunkLoadFailure(new Error("Network request failed"))).toBe(false);
  });
});
