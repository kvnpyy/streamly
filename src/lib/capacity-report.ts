import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  assessCapacity,
  type CapacitySample,
  type VpsSpec,
} from "@/lib/capacity-assess";

export type CapacityReport = {
  generatedAt: string;
  vps: VpsSpec;
  assessment: ReturnType<typeof assessCapacity>;
  projectedMonthlyEgressTb: number | null;
  latestHost: Record<string, unknown> | null;
  appMetrics: Record<string, unknown> | null;
};

export type BuildCapacityReportOpts = {
  appDir?: string;
  samples?: (CapacitySample & { netTxBytes?: number })[];
  vps?: VpsSpec;
  appMetrics?: Record<string, unknown> | null;
};

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function loadCapacitySamples(
  monitorDir: string
): (CapacitySample & { netTxBytes?: number })[] {
  const path = join(monitorDir, "samples.jsonl");
  if (!existsSync(path)) return [];
  const out: (CapacitySample & { netTxBytes?: number })[] = [];
  for (const line of readFileSync(path, "utf8").trim().split("\n")) {
    if (!line) continue;
    try {
      const row = JSON.parse(line) as Record<string, unknown>;
      const ts = String(row.ts ?? "");
      if (!ts) continue;
      out.push({
        ts,
        ramUsedPct: num(row.ramUsedPct),
        cpuPct: num(row.cpuPct),
        diskUsedPct: num(row.diskUsedPct),
        swapUsedMb: num(row.swapUsedMb),
        egressMbps: num(row.egressMbps),
        streamActive: num(row.streamActive),
        streamRpm: num(row.streamRpm),
        netTxBytes: num(row.netTxBytes),
      });
    } catch {
      /* skip */
    }
  }
  return out;
}

export function loadVpsSpec(monitorDir: string): VpsSpec {
  const fromFile = readJson<VpsSpec>(join(monitorDir, "vps-spec.json"));
  if (fromFile) return fromFile;
  return {
    vcpu: 4,
    ramGb: 8,
    diskGb: 75,
    bandwidthMbps: 400,
    trafficTbMonth: null,
  };
}

export function monthlyEgressTb(
  samples: (CapacitySample & { netTxBytes?: number })[]
): number | null {
  const withTx = samples.filter((s) => typeof s.netTxBytes === "number");
  if (withTx.length < 2) return null;
  const first = withTx[0]!;
  const last = withTx[withTx.length - 1]!;
  const t0 = Date.parse(first.ts);
  const t1 = Date.parse(last.ts);
  const dt = t1 - t0;
  if (!Number.isFinite(dt) || dt <= 0) return null;
  const dBytes = last.netTxBytes! - first.netTxBytes!;
  if (dBytes < 0) return null;
  const bytesPerMonth = (dBytes / dt) * 30 * 24 * 3_600_000;
  const tb = bytesPerMonth / 1024 ** 4;
  if (!Number.isFinite(tb) || tb > 10_000) return null;
  return tb;
}

export function buildCapacityReport(opts: BuildCapacityReportOpts = {}): CapacityReport {
  const appDir = opts.appDir ?? process.cwd();
  const monitorDir = join(appDir, "data", "monitor");
  const samples = opts.samples ?? loadCapacitySamples(monitorDir);
  const vps = opts.vps ?? loadVpsSpec(monitorDir);
  const remote = opts.appMetrics;
  const app = (remote ?? {}) as {
    streamProxy?: { activePeak?: number; rpmP95?: number };
    node?: { rssMb?: number };
    uptimeSec?: number;
  };

  const assessment = assessCapacity({
    samples,
    vps,
    app: {
      streamActivePeak: app.streamProxy?.activePeak,
      streamRpmP95: app.streamProxy?.rpmP95,
      nodeRssMb: app.node?.rssMb,
      uptimeSec: app.uptimeSec,
    },
  });

  return {
    generatedAt: new Date().toISOString(),
    vps,
    assessment,
    projectedMonthlyEgressTb: monthlyEgressTb(samples),
    latestHost: readJson(join(monitorDir, "latest.json")),
    appMetrics: remote ?? null,
  };
}
