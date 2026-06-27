#!/usr/bin/env tsx
/**
 * Human + JSON capacity report — paste output into Cursor to ask "should I upgrade?"
 *
 * Usage (on VPS):
 *   npm run monitor:report
 *   npm run monitor:report -- --json
 */
import { buildCapacityReport } from "../src/lib/capacity-report";

const jsonOnly = process.argv.includes("--json");

async function main() {
  const report = buildCapacityReport();

  if (jsonOnly) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { assessment, vps } = report;
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
  if (report.projectedMonthlyEgressTb != null) {
    console.log(`    Projected monthly egress: ~${report.projectedMonthlyEgressTb.toFixed(2)} TB`);
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
