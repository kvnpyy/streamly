import { describe, expect, it } from "vitest";
import {
  epgListingsHaveParsableTimes,
  epgListingsOverlapWindow,
  epgProgramRangeUnixSec,
  epgUnixSeconds,
} from "./epg-time";

describe("epgUnixSeconds", () => {
  it("parses second-granularity Xtream strings", () => {
    expect(epgUnixSeconds("1735689600")).toBe(1735689600);
  });

  it("treats very large values as milliseconds", () => {
    expect(epgUnixSeconds("1735689600000")).toBe(1735689600);
    expect(epgUnixSeconds(1735689600000)).toBe(1735689600);
  });

  it("returns null for invalid input", () => {
    expect(epgUnixSeconds("")).toBe(null);
    expect(epgUnixSeconds(undefined)).toBe(null);
    expect(epgUnixSeconds("abc")).toBe(null);
  });
});

describe("epgListingsHaveParsableTimes", () => {
  it("is false for empty or junk-only listings", () => {
    expect(epgListingsHaveParsableTimes(undefined)).toBe(false);
    expect(epgListingsHaveParsableTimes([])).toBe(false);
    expect(
      epgListingsHaveParsableTimes([
        { title: "x", start_timestamp: "", stop_timestamp: "" },
      ])
    ).toBe(false);
  });

  it("is true when any row parses", () => {
    expect(
      epgListingsHaveParsableTimes([
        { title: "x", start_timestamp: "1735689600", stop_timestamp: "1735693200" },
      ])
    ).toBe(true);
  });
});

describe("epgListingsOverlapWindow", () => {
  it("is false when all programmes fall outside the window", () => {
    expect(
      epgListingsOverlapWindow(
        [
          {
            start_timestamp: "1700000000",
            stop_timestamp: "1700003600",
          },
        ],
        1735689600,
        1735696800
      )
    ).toBe(false);
  });

  it("is true when any programme intersects the window", () => {
    expect(
      epgListingsOverlapWindow(
        [
          {
            start_timestamp: "1735690000",
            stop_timestamp: "1735697200",
          },
        ],
        1735689600,
        1735696800
      )
    ).toBe(true);
  });
});

describe("epgProgramRangeUnixSec", () => {
  it("falls back to ISO start/end when unix fields absent", () => {
    const s = "2030-06-01T12:00:00.000Z";
    const e = "2030-06-01T14:30:00.000Z";
    const r = epgProgramRangeUnixSec({ start: s, end: e });
    expect(r).toEqual({
      start: Math.floor(Date.parse(s) / 1000),
      end: Math.floor(Date.parse(e) / 1000),
    });
  });

  it("prefers unix timestamps when present", () => {
    expect(
      epgProgramRangeUnixSec({
        start_timestamp: "1735689600",
        stop_timestamp: "1735693200",
      })
    ).toEqual({ start: 1735689600, end: 1735693200 });
  });
});
