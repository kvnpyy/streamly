import { describe, expect, it } from "vitest";
import {
  bytesToReclaim,
  diskFreeReserveBytes,
  evictionKeysForPressure,
} from "./disk-pressure";

describe("diskFreeReserveBytes", () => {
  it("defaults to 8GB", () => {
    expect(diskFreeReserveBytes(undefined)).toBe(8_000_000_000);
  });

  it("rejects a reserve under 1GB", () => {
    expect(diskFreeReserveBytes("100")).toBe(8_000_000_000);
  });
});

describe("bytesToReclaim", () => {
  it("reclaims the over-cap amount when the volume still has reserve free", () => {
    expect(
      bytesToReclaim({
        usedBytes: 20,
        maxBytes: 15,
        freeBytes: 20,
        reserveBytes: 8,
      })
    ).toBe(5);
  });

  it("reclaims enough to restore the free-space reserve even under the cache cap", () => {
    expect(
      bytesToReclaim({
        usedBytes: 10,
        maxBytes: 15,
        freeBytes: 3,
        reserveBytes: 8,
      })
    ).toBe(5);
  });

  it("uses only the cap when free space is unknown", () => {
    expect(
      bytesToReclaim({
        usedBytes: 12,
        maxBytes: 15,
        freeBytes: null,
        reserveBytes: 8,
      })
    ).toBe(0);
  });
});

describe("evictionKeysForPressure", () => {
  const files = [
    { key: "old", bytes: 8, mtimeMs: 1 },
    { key: "hot", bytes: 8, mtimeMs: 2 },
    { key: "live", bytes: 8, mtimeMs: 3 },
  ];

  it("evicts the oldest files past the cap, including ones touched recently", () => {
    expect(
      evictionKeysForPressure({
        files,
        usedBytes: 24,
        maxBytes: 10,
        freeBytes: 100,
        reserveBytes: 8,
        protectKeys: [],
      })
    ).toEqual(["old", "hot"]);
  });

  it("does not delete an in-flight download", () => {
    expect(
      evictionKeysForPressure({
        files,
        usedBytes: 24,
        maxBytes: 10,
        freeBytes: 1,
        reserveBytes: 8,
        protectKeys: ["live"],
      })
    ).toEqual(["old", "hot"]);
  });

  it("evicts when the volume is below the reserve even if the cache is under its cap", () => {
    expect(
      evictionKeysForPressure({
        files,
        usedBytes: 24,
        maxBytes: 30,
        freeBytes: 2,
        reserveBytes: 10,
        protectKeys: [],
      })
    ).toEqual(["old"]);
  });
});
