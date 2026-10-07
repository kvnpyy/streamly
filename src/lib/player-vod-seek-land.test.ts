import { describe, expect, it } from "vitest";
import {
  shouldSuppressVodTipPersist,
  vodSeekPlayheadLanded,
  vodSeekShouldReloadPipeline,
  vodSeekTargetBuffered,
  VOD_SEEK_LAND_TOLERANCE_SEC,
  VOD_SEEK_SUPPRESS_TIP_PERSIST_MS,
} from "./player-vod-seek-land";

describe("vodSeekShouldReloadPipeline", () => {
  it("retries the load once, not on every tick", () => {
    expect(vodSeekShouldReloadPipeline(0)).toBe(false);
    expect(vodSeekShouldReloadPipeline(7)).toBe(false);
    expect(vodSeekShouldReloadPipeline(8)).toBe(true);
    expect(vodSeekShouldReloadPipeline(9)).toBe(false);
  });
});

describe("vodSeekTargetBuffered", () => {
  const ranges = (pairs: Array<[number, number]>) => ({
    length: pairs.length,
    start: (i: number) => pairs[i]![0],
    end: (i: number) => pairs[i]![1],
  });

  it("is not landed when the clock moved but that time is not buffered", () => {
    expect(vodSeekTargetBuffered(ranges([[0, 8]]), 900)).toBe(false);
  });

  it("is landed when the target sits in a buffered range", () => {
    expect(vodSeekTargetBuffered(ranges([[896, 908]]), 900)).toBe(true);
  });
});

describe("vodSeekPlayheadLanded", () => {
  it("accepts playhead within tolerance", () => {
    expect(vodSeekPlayheadLanded(2400, 2400.5)).toBe(true);
    expect(
      vodSeekPlayheadLanded(2400, 2400 + VOD_SEEK_LAND_TOLERANCE_SEC)
    ).toBe(true);
  });

  it("rejects tip snap after scrub-back", () => {
    expect(vodSeekPlayheadLanded(6296, 2400)).toBe(false);
  });

  it("accepts opening PTS when scrubbing to the start", () => {
    expect(vodSeekPlayheadLanded(1.47, 0)).toBe(true);
    expect(vodSeekPlayheadLanded(3.8, 0)).toBe(true);
    expect(vodSeekPlayheadLanded(12, 0)).toBe(false);
  });

  it("rejects non-finite times", () => {
    expect(vodSeekPlayheadLanded(Number.NaN, 2400)).toBe(false);
  });
});

describe("shouldSuppressVodTipPersist", () => {
  it("suppresses until the window expires", () => {
    const until = 1_000_000;
    expect(shouldSuppressVodTipPersist(until - 1, until)).toBe(true);
    expect(shouldSuppressVodTipPersist(until, until)).toBe(false);
    expect(shouldSuppressVodTipPersist(until + 1, until)).toBe(false);
  });

  it("uses a 20s tip-persist hold after intentional scrub", () => {
    expect(VOD_SEEK_SUPPRESS_TIP_PERSIST_MS).toBe(20_000);
  });
});
