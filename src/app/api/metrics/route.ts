import { assessCapacity, type VpsSpec } from "@/lib/capacity-assess";
import { assessApiHealth } from "@/lib/assess-api-health";
import { getIptvApiErrorMetrics } from "@/lib/iptv-api-error-metrics";
import { getCastMetrics } from "@/lib/cast-metrics";
import { getRuntimeMetrics } from "@/lib/runtime-metrics";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HostSnapshot = {
  ts?: string;
  ram?: { totalMb?: number; usedMb?: number; usedPct?: number };
  cpu?: { pct?: number; load1?: number };
  disk?: { usedPct?: number; usedGb?: number; totalGb?: number };
  network?: { egressMbps?: number; txBytes?: number };
  stream?: { serviceActive?: boolean };
  nodeRssMb?: number;
};

function metricsSecret(): string | null {
  const s = process.env.CAPACITY_METRICS_SECRET?.trim();
  return s && s.length >= 16 ? s : null;
}

function unauthorized(requestId: string) {
  return NextResponse.json(
    { ok: false, error: "unauthorized" },
    { status: 401, headers: { "x-request-id": requestId } }
  );
}

function readHostSnapshot(): HostSnapshot | null {
  const dbUrl = process.env.DATABASE_URL ?? "file:./data/stream.db";
  const dataDir = dbUrl.startsWith("file:")
    ? join(process.cwd(), dbUrl.replace(/^file:/, "").replace(/\/[^/]+$/, "") || "data")
    : join(process.cwd(), "data");
  const path = join(dataDir, "monitor", "latest.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as HostSnapshot;
  } catch {
    return null;
  }
}

function readVpsSpec(dataDir: string): VpsSpec {
  const path = join(dataDir, "monitor", "vps-spec.json");
  if (!existsSync(path)) {
    return {
      vcpu: numEnv("CAPACITY_VPS_VCPU", 4),
      ramGb: numEnv("CAPACITY_VPS_RAM_GB", 8),
      diskGb: numEnv("CAPACITY_VPS_DISK_GB", 75),
      bandwidthMbps: numEnv("CAPACITY_VPS_BANDWIDTH_MBPS", 400),
      trafficTbMonth: null,
    };
  }
  try {
    return JSON.parse(readFileSync(path, "utf8")) as VpsSpec;
  } catch {
    return {};
  }
}

function numEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function readRecentSamples(dataDir: string, max = 288) {
  const path = join(dataDir, "monitor", "samples.jsonl");
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  const tail = lines.slice(-max);
  return tail
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
        };
      } catch {
        return null;
      }
    })
    .filter((s): s is NonNullable<typeof s> => s != null && Boolean(s.ts));
}

function num(v: unknown): number | undefined {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Protected capacity + runtime metrics for VPS monitoring.
 * Requires `CAPACITY_METRICS_SECRET` (≥16 chars) via `Authorization: Bearer …`
 * or `?token=…` (cron / local only).
 */
export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID();
  const secret = metricsSecret();
  if (!secret) {
    return NextResponse.json(
      {
        ok: false,
        error: "metrics_disabled",
        hint: "Set CAPACITY_METRICS_SECRET in .env and run scripts/vps-monitoring-setup.sh",
      },
      { status: 503, headers: { "x-request-id": requestId } }
    );
  }

  const url = new URL(req.url);
  const bearer = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const token = url.searchParams.get("token") ?? bearer;
  if (token !== secret) {
    return unauthorized(requestId);
  }

  const dbUrl = process.env.DATABASE_URL ?? "file:./data/stream.db";
  const dataDir = dbUrl.startsWith("file:")
    ? join(
        process.cwd(),
        dbUrl.replace(/^file:/, "").replace(/\/[^/]+$/, "") || "data"
      )
    : join(process.cwd(), "data");

  const app = getRuntimeMetrics();
  const apiErrors = getIptvApiErrorMetrics();
  const cast = getCastMetrics();
  const apiHealth = assessApiHealth(apiErrors);
  const host = readHostSnapshot();
  const samples = readRecentSamples(dataDir);
  const vps = readVpsSpec(dataDir);

  const assessment = assessCapacity({
    samples,
    vps,
    app: {
      streamActivePeak: app.streamProxy.activePeak,
      streamRpmP95: app.streamProxy.rpmP95,
      nodeRssMb: app.node.rssMb,
      bytesOutGbSinceBoot: app.streamProxy.bytesOutGb,
      uptimeSec: app.uptimeSec,
    },
  });

  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    vps,
    app,
    apiErrors,
    cast,
    apiHealth,
    host,
    assessment,
  });
}
