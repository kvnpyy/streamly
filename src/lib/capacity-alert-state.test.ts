import { describe, expect, it } from "vitest";
import { shouldSendCapacityAlert } from "./capacity-alert-state";

describe("shouldSendCapacityAlert", () => {
  const empty = { lastNotifiedAt: null, lastNotifiedSignal: null };

  it("skips baseline collection", () => {
    expect(
      shouldSendCapacityAlert({
        overall: "upgrade_soon",
        minSignal: "upgrade_soon",
        isBaseline: true,
        state: empty,
      })
    ).toBe(false);
  });

  it("skips ok and watch by default threshold", () => {
    expect(
      shouldSendCapacityAlert({
        overall: "watch",
        minSignal: "upgrade_soon",
        isBaseline: false,
        state: empty,
      })
    ).toBe(false);
  });

  it("sends first upgrade_soon alert", () => {
    expect(
      shouldSendCapacityAlert({
        overall: "upgrade_soon",
        minSignal: "upgrade_soon",
        isBaseline: false,
        state: empty,
      })
    ).toBe(true);
  });

  it("dedupes same signal within cooldown", () => {
    const now = Date.now();
    expect(
      shouldSendCapacityAlert({
        overall: "upgrade_soon",
        minSignal: "upgrade_soon",
        isBaseline: false,
        state: {
          lastNotifiedAt: new Date(now - 3600_000).toISOString(),
          lastNotifiedSignal: "upgrade_soon",
        },
        nowMs: now,
        cooldownMs: 24 * 3_600_000,
      })
    ).toBe(false);
  });

  it("escalates immediately to upgrade_now", () => {
    const now = Date.now();
    expect(
      shouldSendCapacityAlert({
        overall: "upgrade_now",
        minSignal: "upgrade_soon",
        isBaseline: false,
        state: {
          lastNotifiedAt: new Date(now - 3600_000).toISOString(),
          lastNotifiedSignal: "upgrade_soon",
        },
        nowMs: now,
      })
    ).toBe(true);
  });
});
