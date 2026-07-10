import { afterEach, describe, expect, it } from "vitest";
import {
  getCastMetrics,
  recordCastMetric,
  resetCastMetricsForTests,
} from "./cast-metrics";

describe("cast-metrics", () => {
  afterEach(() => {
    resetCastMetricsForTests();
  });

  it("records funnel events into the rolling window", () => {
    recordCastMetric("cast_prep_ok");
    recordCastMetric("cast_stall", 2);
    const snap = getCastMetrics();
    expect(snap.last15Min.cast_prep_ok).toBe(1);
    expect(snap.last15Min.cast_stall).toBe(2);
    expect(snap.last60Min.cast_stall).toBe(2);
  });
});
