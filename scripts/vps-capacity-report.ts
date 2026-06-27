#!/usr/bin/env tsx
/**
 * Human + JSON capacity report — paste output into Cursor to ask "should I upgrade?"
 *
 * Usage (on VPS):
 *   npm run monitor:report
 *   npm run monitor:report -- --json
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { assessCapacity, type CapacitySample, type VpsSpec } from "../src/lib/capacity-assess";

const APP_DIR = process.cwd();
const MONITOR_DIR = join(APP_DIR, "data", "monitor");
const jsonOnly = process.argv.includes("--json");

function readJson<T>(path: string): T | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return null;
  }
}

function loadSamples(): CapacitySample[] {
  const path = join(MONITOR_DIR, "samples.jsonl");
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        const row = JSON.parse(line) as Record<string, unknown>;
        return {
          ts: String(row.ts ?? ""),
          ramUsedPct: num(row.ramUsedPct),
          cpuPct: num(row.cpuPct),
          diskUsedPct: num(row.diskUsedPct),
          swapUsedMb: num(row.swapUsedMb),
          egressMbps: num(row.egressMbps),
          streamActive: num(row.streamActive),
          streamRpm: num(row.streamRpm),
          netTxBytes: num(row.netTxBytes),
        };
      } catch {
        return null;
      }
    })
    .filter((s): s is CapacitySample => s != null && Boolean(s.ts));
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function loadVpsSpec(): VpsSpec {
  const fromFile = readJson<VpsSpec>(join(MONITOR_DIR, "vps-spec.json"));
  if (fromFile) return fromFile;
  return {
    vcpu: 4,
    ramGb: 8,
    diskGb: 75,
    bandwidthMbps: 400,
    trafficTbMonth: null,
  };
}

async function fetchAppMetrics(): Promise<Record<string, unknown> | null> {
  const envPath = join(APP_DIR, ".env");
  if (!existsSync(envPath)) return null;
  const envText = readFileSync(envPath, "utf8");
  const match = envText.match(/^CAPACITY_METRICS_SECRET=(.+)$/m);
  const secret = match?.[1]?.trim().replace(/^["']|["']$/g, "");
  if (!secret || secret.length < 16) return null;
  try {
    const res = await fetch(
      `http://127.0.0.1:3000/api/metrics?token=${encodeURIComponent(secret)}`,
      { headers: { Authorization: `Bearer ${secret}` } }
    );
    if (!res.ok) return null;
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function monthlyEgressTb(
  samples: (CapacitySample & { netTxBytes?: number })[]
): number | null {
  const withTx = samples.filter((s) => typeof s.netTxBytes === "number");
  if (withTx.length < 2) return null;
  const first = withTx[0] as CapacitySample & { netTxBytes: number };
  const last = withTx[withTx.length - 1] as CapacitySample & { netTxBytes: number };
  const t0 = Date.parse(first.ts);
  const t1 = Date.parse(last.ts);
  const dt = t1 - t0;
  if (!Number.isFinite(dt) || dt <= 0) return null;
  const dBytes = last.netTxBytes - first.netTxBytes;
  if (dBytes < 0) return null;
  const bytesPerMonth = (dBytes / dt) * 30 * 24 * 3_600_000;
  return bytesPerMonth / 1024 ** 4;
}

async function main() {
  const samples = loadSamples();
  const vps = loadVpsSpec();
  const remote = await fetchAppMetrics();
  const app = (remote?.app ?? {}) as {
    streamProxy?: { activePeak?: number; rpmP95?: number };
    node?: { rssMb?: number };
    streamProxy_bytes?: number;
    uptimeSec?: number;
  };

  const assessment = assessCapacity({
    samples,
    vps,
    app: {
      streamActivePeak: app.streamProxy?.activePeak,
      streamRpmP95: app.streamProxy?.rpmP95,
      nodeRssMb: app.node?.rssMb,
      uptimeSec: (remote as { app?: { uptimeSec?: number } })?.app?.uptimeSec,
    },
  });

  const projectedTb = monthlyEgressTb(samples);

  const report = {
    generatedAt: new Date().toISOString(),
    vps,
    assessment,
    projectedMonthlyEgressTb: projectedTb,
    latestHost: readJson(join(MONITOR_DIR, "latest.json")),
    appMetrics: remote?.app ?? null,
  };

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const signalEmoji: Record<string, string> = {
    ok: "✅",
    watch: "👀",
    upgrade_soon: "⚠️",
    upgrade_now: "🔴",
  };

  console.log("");
  console.log("══════════════════════════════════════════════════");
  console.log("  Streamly VPS capacity report");
  console.log("══════════════════════════════════════════════════");
  console.log(`  Overall: ${signalEmoji[assessment.overall] ?? ""} ${assessment.overall.toUpperCase()}`);
  console.log(`  Samples: ${assessment.stats.sampleCount} (~${assessment.stats.windowHours}h window)`);
  console.log(`  Plan: ${vps.vcpu ?? "?"} vCPU · ${vps.ramGb ?? "?"} GB RAM · ${vps.bandwidthMbps ?? "?"} Mbps`);
  console.log("");
  console.log("  Stats (p95 unless noted)");
  console.log(`    RAM:      ${assessment.stats.ramUsedPctP95.toFixed(0)}% (peak ${assessment.stats.ramUsedPctMax.toFixed(0)}%)`);
  console.log(`    CPU:      ${assessment.stats.cpuPctP95.toFixed(0)}%`);
  console.log(`    Disk:     ${assessment.stats.diskUsedPct.toFixed(0)}%`);
  console.log(`    Egress:   ${assessment.stats.egressMbpsP95.toFixed(0)} Mbps (peak ${assessment.stats.egressMbpsPeak.toFixed(0)} Mbps)`);
  console.log(`    Streams:  ~${assessment.stats.streamActiveP95.toFixed(0)} concurrent proxy (est. ${assessment.stats.estimatedConcurrentHdStreams} HD @ peak)`);
  if (projectedTb != null) {
    console.log(`    Projected monthly egress: ~${projectedTb.toFixed(2)} TB`);
  }
  console.log("");
  console.log("  Findings");
  for (const f of assessment.findings) {
    console.log(`    ${signalEmoji[f.signal] ?? "•"} [${f.signal}] ${f.title}`);
    console.log(`       ${f.detail}`);
  }
  console.log("");
  console.log("  Tip: paste this report (or `npm run monitor:report -- --json`) into Cursor");
  console.log("       and ask whether you should upgrade your VPS.");
  console.log("══════════════════════════════════════════════════");
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
