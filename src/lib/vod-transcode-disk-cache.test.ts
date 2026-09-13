import { describe, expect, it } from "vitest";
import {
  planTranscodeDiskEvictions,
  transcodeMaxCacheBytes,
} from "./vod-transcode-disk-cache";

describe("transcodeMaxCacheBytes", () => {
  it("defaults to 20GB", () => {
    expect(transcodeMaxCacheBytes(undefined)).toBe(20_000_000_000);
  });

  it("accepts a configured cap", () => {
    expect(transcodeMaxCacheBytes("15000000000")).toBe(15_000_000_000);
  });

  it("rejects tiny caps", () => {
    expect(transcodeMaxCacheBytes("100")).toBe(20_000_000_000);
  });
});

describe("planTranscodeDiskEvictions", () => {
  const dirs = [
    { key: "old", bytes: 8_000, mtimeMs: 1 },
    { key: "mid", bytes: 8_000, mtimeMs: 2 },
    { key: "new", bytes: 8_000, mtimeMs: 3 },
  ];

  it("does nothing when under the cap", () => {
    expect(
      planTranscodeDiskEvictions({
        dirs,
        usedBytes: 24_000,
        maxBytes: 30_000,
        protectKeys: [],
      })
    ).toEqual([]);
  });

  it("evicts oldest first until under the cap", () => {
    expect(
      planTranscodeDiskEvictions({
        dirs,
        usedBytes: 24_000,
        maxBytes: 10_000,
        protectKeys: [],
      })
    ).toEqual(["old", "mid"]);
  });

  it("skips protected dirs even if they are oldest", () => {
    expect(
      planTranscodeDiskEvictions({
        dirs,
        usedBytes: 24_000,
        maxBytes: 10_000,
        protectKeys: ["old"],
      })
    ).toEqual(["mid", "new"]);
  });
});
