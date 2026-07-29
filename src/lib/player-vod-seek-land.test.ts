import { describe, expect, it } from "vitest";
import {
  shouldSuppressVodTipPersist,
  vodSeekPlayheadLanded,
  VOD_SEEK_LAND_TOLERANCE_SEC,
  VOD_SEEK_SUPPRESS_TIP_PERSIST_MS,
} from "./player-vod-seek-land";

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
