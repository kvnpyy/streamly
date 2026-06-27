import { describe, expect, it } from "vitest";
import { assessCapacity } from "./capacity-assess";

function samples(n: number, overrides: Partial<{ ram: number; cpu: number; disk: number; egress: number; swap: number; active: number }>) {
  return Array.from({ length: n }, (_, i) => ({
    ts: new Date(Date.UTC(2026, 0, 1, 0, i * 5)).toISOString(),
    ramUsedPct: overrides.ram ?? 40,
    cpuPct: overrides.cpu ?? 20,
    diskUsedPct: overrides.disk ?? 30,
    swapUsedMb: overrides.swap ?? 0,
    egressMbps: overrides.egress ?? 10,
    streamActive: overrides.active ?? 1,
    streamRpm: 120,
  }));
}

describe("assessCapacity", () => {
  it("asks for more baseline samples when history is short", () => {
    const r = assessCapacity({
      samples: samples(10, {}),
      vps: { ramGb: 8, bandwidthMbps: 400 },
    });
    expect(r.overall).toBe("ok");
    expect(r.findings.some((f) => f.id === "baseline")).toBe(true);
  });

  it("flags high RAM", () => {
    const r = assessCapacity({
      samples: samples(60, { ram: 92 }),
      vps: { ramGb: 8, bandwidthMbps: 400 },
    });
    expect(r.findings.some((f) => f.id === "ram" && f.signal === "upgrade_now")).toBe(
      true
    );
    expect(r.overall).toBe("upgrade_now");
  });

  it("flags bandwidth pressure", () => {
    const r = assessCapacity({
      samples: samples(60, { egress: 360 }),
      vps: { ramGb: 8, bandwidthMbps: 400 },
    });
    expect(r.findings.some((f) => f.id === "bandwidth")).toBe(true);
    expect(["upgrade_soon", "upgrade_now"]).toContain(r.overall);
  });

  it("reports healthy when metrics are low", () => {
    const r = assessCapacity({
      samples: samples(60, { ram: 35, cpu: 15, egress: 8, active: 2 }),
      vps: { ramGb: 8, bandwidthMbps: 400 },
    });
    expect(r.overall).toBe("ok");
    expect(r.findings.some((f) => f.id === "healthy")).toBe(true);
  });
});
