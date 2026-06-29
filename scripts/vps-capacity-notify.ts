#!/usr/bin/env tsx
/**
 * Hourly capacity check — emails when upgrade_soon / upgrade_now (Resend).
 *
 * Usage (on VPS, via cron):
 *   npm run monitor:notify
 *   npm run monitor:notify -- --dry-run
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  parseCapacityAlertState,
  shouldSendCapacityAlert,
  type CapacityAlertState,
} from "../src/lib/capacity-alert-state";
import { sendCapacityAlertEmail } from "../src/lib/capacity-alert-mail";
import { buildCapacityReport } from "../src/lib/capacity-report";
import type { CapacitySignal } from "../src/lib/capacity-assess";
import { runApiHealthNotify } from "./vps-api-health-notify";

const APP_DIR = process.cwd();
const MONITOR_DIR = join(APP_DIR, "data", "monitor");
const STATE_FILE = join(MONITOR_DIR, "alert-state.json");
const dryRun = process.argv.includes("--dry-run");

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

async function fetchAppMetrics(): Promise<Record<string, unknown> | null> {
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

function readState(): CapacityAlertState {
  if (!existsSync(STATE_FILE)) {
    return { lastNotifiedAt: null, lastNotifiedSignal: null };
  }
  try {
    return parseCapacityAlertState(
      JSON.parse(readFileSync(STATE_FILE, "utf8"))
    );
  } catch {
    return { lastNotifiedAt: null, lastNotifiedSignal: null };
  }
}

function writeState(state: CapacityAlertState): void {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

function minSignalFromEnv(): CapacitySignal {
  const raw = process.env.CAPACITY_ALERT_MIN_SIGNAL?.trim() ?? "upgrade_soon";
  const allowed: CapacitySignal[] = [
    "watch",
    "upgrade_soon",
    "upgrade_now",
  ];
  return allowed.includes(raw as CapacitySignal)
    ? (raw as CapacitySignal)
    : "upgrade_soon";
}

async function main() {
  if (process.env.CAPACITY_ALERT_DISABLED === "1") {
    console.log("[capacity:notify] disabled (CAPACITY_ALERT_DISABLED=1)");
    return;
  }

  loadEnvFile();

  const remote = await fetchAppMetrics();
  const report = buildCapacityReport({
    appDir: APP_DIR,
    appMetrics: (remote?.app as Record<string, unknown>) ?? null,
  });

  const isBaseline = report.assessment.findings.some((f) => f.id === "baseline");
  const minSignal = minSignalFromEnv();
  const state = readState();

  const send = shouldSendCapacityAlert({
    overall: report.assessment.overall,
    minSignal,
    isBaseline,
    state,
  });

  if (!send) {
    console.log(
      `[capacity:notify] no alert (${report.assessment.overall}, baseline=${isBaseline})`
    );
    if (report.assessment.overall === "ok") {
      writeState({ lastNotifiedAt: null, lastNotifiedSignal: null });
    }
    await runApiHealthNotify();
    return;
  }

  if (dryRun) {
    console.log(
      `[capacity:notify] dry-run would email: ${report.assessment.overall}`
    );
    console.log(JSON.stringify(report.assessment.findings, null, 2));
    await runApiHealthNotify({ dryRun: true });
    return;
  }

  const mailed = await sendCapacityAlertEmail(report);
  if (!mailed.ok) {
    console.error("[capacity:notify] send failed:", mailed.reason);
    process.exit(1);
  }

  writeState({
    lastNotifiedAt: new Date().toISOString(),
    lastNotifiedSignal: report.assessment.overall,
  });
  console.log(
    `[capacity:notify] sent ${report.assessment.overall} alert`
  );

  await runApiHealthNotify();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
