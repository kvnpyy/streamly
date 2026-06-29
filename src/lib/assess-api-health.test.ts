import { describe, expect, it, beforeEach } from "vitest";

import { assessApiHealth } from "./assess-api-health";
import {
  getIptvApiErrorMetrics,
  recordIptvApiError,
  resetIptvApiErrorMetricsForTests,
} from "./iptv-api-error-metrics";
import { shouldSendApiHealthAlert } from "./api-health-alert-state";

describe("assessApiHealth", () => {
  it("returns ok when counters are low", () => {
    const health = assessApiHealth(getIptvApiErrorMetrics());
    expect(health.overall).toBe("ok");
  });

  it("alerts on missing_credentials spike", () => {
    resetIptvApiErrorMetricsForTests();
    for (let i = 0; i < 45; i++) {
      recordIptvApiError("missing_credentials");
    }
    const health = assessApiHealth(getIptvApiErrorMetrics());
    expect(health.overall).toBe("alert");
    expect(health.findings.some((f) => f.id === "missing_credentials_spike")).toBe(
      true
    );
  });

  it("watches on moderate turnstile_required", () => {
    resetIptvApiErrorMetricsForTests();
    for (let i = 0; i < 20; i++) {
      recordIptvApiError("turnstile_required");
    }
    const health = assessApiHealth(getIptvApiErrorMetrics());
    expect(health.overall).toBe("watch");
  });
});

describe("shouldSendApiHealthAlert", () => {
  it("sends first alert", () => {
    expect(
      shouldSendApiHealthAlert({
        overall: "alert",
        state: { lastNotifiedAt: null, lastNotifiedSignal: null },
      })
    ).toBe(true);
  });

  it("respects cooldown for watch", () => {
    const now = Date.now();
    expect(
      shouldSendApiHealthAlert({
        overall: "watch",
        state: {
          lastNotifiedAt: new Date(now - 1000).toISOString(),
          lastNotifiedSignal: "watch",
        },
        now,
      })
    ).toBe(false);
  });
});

describe("iptv api error metrics", () => {
  beforeEach(() => resetIptvApiErrorMetricsForTests());

  it("aggregates last15Min", () => {
    recordIptvApiError("stream_upstream_4xx", 3);
    const m = getIptvApiErrorMetrics();
    expect(m.last15Min.stream_upstream_4xx).toBe(3);
  });
});
