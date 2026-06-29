#!/usr/bin/env tsx
/**
 * Hourly IPTV API health check — emails when error rates spike (Resend).
 *
 * Usage (on VPS, via cron — also invoked from monitor:notify):
 *   npm run monitor:api-health-notify
 *   npm run monitor:api-health-notify -- --dry-run
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  parseApiHealthAlertState,
  shouldSendApiHealthAlert,
  type ApiHealthAlertState,
} from "../src/lib/api-health-alert-state";
import { sendApiHealthAlertEmail } from "../src/lib/api-health-alert-mail";
import { assessApiHealth } from "../src/lib/assess-api-health";
import type { IptvApiErrorMetrics } from "../src/lib/iptv-api-error-metrics";

const APP_DIR = process.cwd();
const MONITOR_DIR = join(APP_DIR, "data", "monitor");
const STATE_FILE = join(MONITOR_DIR, "api-health-alert-state.json");
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

function readState(): ApiHealthAlertState {
  if (!existsSync(STATE_FILE)) {
    return { lastNotifiedAt: null, lastNotifiedSignal: null };
  }
  try {
    return parseApiHealthAlertState(
      JSON.parse(readFileSync(STATE_FILE, "utf8"))
    );
  } catch {
    return { lastNotifiedAt: null, lastNotifiedSignal: null };
  }
}

function writeState(state: ApiHealthAlertState): void {
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

export async function runApiHealthNotify(opts?: { dryRun?: boolean }): Promise<void> {
  const isDryRun = opts?.dryRun ?? dryRun;

  if (process.env.API_HEALTH_ALERT_DISABLED === "1") {
    console.log("[api-health:notify] disabled (API_HEALTH_ALERT_DISABLED=1)");
    return;
  }

  loadEnvFile();

  const remote = await fetchAppMetrics();
  const metrics = (remote?.apiErrors as IptvApiErrorMetrics) ?? null;
  if (!metrics) {
    console.log("[api-health:notify] no metrics (is stream running?)");
    return;
  }

  const health = assessApiHealth(metrics);
  const state = readState();
  const send = shouldSendApiHealthAlert({
    overall: health.overall,
    state,
  });

  if (!send) {
    console.log(`[api-health:notify] no alert (${health.overall})`);
    if (health.overall === "ok") {
      writeState({ lastNotifiedAt: null, lastNotifiedSignal: null });
    }
    return;
  }

  if (isDryRun) {
    console.log(`[api-health:notify] dry-run would email: ${health.overall}`);
    console.log(JSON.stringify(health.findings, null, 2));
    return;
  }

  const mailed = await sendApiHealthAlertEmail({
    overall: health.overall,
    findings: health.findings,
    metrics,
  });
  if (!mailed.ok) {
    console.error("[api-health:notify] send failed:", mailed.reason);
    process.exit(1);
  }

  writeState({
    lastNotifiedAt: new Date().toISOString(),
    lastNotifiedSignal: health.overall,
  });
  console.log(`[api-health:notify] sent ${health.overall} alert`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

async function main() {
  await runApiHealthNotify();
}
