#!/usr/bin/env tsx
/**
 * Human-readable IPTV API health report — paste into Cursor for triage.
 *
 * Usage (on VPS):
 *   npm run monitor:health-report
 *   npm run monitor:health-report -- --json
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { assessApiHealth } from "../src/lib/assess-api-health";
import { getIptvApiErrorMetrics } from "../src/lib/iptv-api-error-metrics";

const jsonOut = process.argv.includes("--json");
const APP_DIR = process.cwd();

function loadEnvFile(): void {
  const envPath = join(APP_DIR, ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1]!;
    let val = m[2]!.trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

async function fetchMetrics(): Promise<Record<string, unknown> | null> {
  const secret = process.env.CAPACITY_METRICS_SECRET?.trim();
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

async function main() {
  loadEnvFile();
  const remote = await fetchMetrics();
  const metrics =
    (remote?.apiErrors as ReturnType<typeof getIptvApiErrorMetrics>) ??
    getIptvApiErrorMetrics();
  const health = assessApiHealth(metrics);

  if (jsonOut) {
    console.log(JSON.stringify({ metrics, health }, null, 2));
    return;
  }

  console.log("");
  console.log("  Streamly IPTV API health report");
  console.log("  ===============================");
  console.log(`  Overall: ${health.overall.toUpperCase()}`);
  console.log("");
  for (const f of health.findings) {
    if (f.id === "healthy") continue;
    console.log(`  [${f.signal}] ${f.title} (${f.count15m} in 15m)`);
    console.log(`    ${f.detail}`);
    console.log("");
  }
  console.log("  Last 15 min error counters:");
  for (const [k, v] of Object.entries(metrics.last15Min)) {
    if (v > 0) console.log(`    ${k}: ${v}`);
  }
  console.log("");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
