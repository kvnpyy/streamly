export type CapacitySignal = "ok" | "watch" | "upgrade_soon" | "upgrade_now";

export type CapacityFinding = {
  id: string;
  signal: CapacitySignal;
  title: string;
  detail: string;
};

export type CapacitySample = {
  ts: string;
  ramUsedPct?: number;
  cpuPct?: number;
  diskUsedPct?: number;
  swapUsedMb?: number;
  egressMbps?: number;
  streamActive?: number;
  streamRpm?: number;
};

export type VpsSpec = {
  vcpu?: number;
  ramGb?: number;
  diskGb?: number;
  bandwidthMbps?: number;
  /** Monthly egress cap in TB; omit when unlimited. */
  trafficTbMonth?: number | null;
};

export type CapacityAssessInput = {
  samples: CapacitySample[];
  vps: VpsSpec;
  app?: {
    streamActivePeak?: number;
    streamRpmP95?: number;
    nodeRssMb?: number;
    bytesOutGbSinceBoot?: number;
    uptimeSec?: number;
  };
  /** Minimum samples before upgrade signals (default 48 ≈ 4h at 5m). */
  minSamples?: number;
};

const SIGNAL_RANK: Record<CapacitySignal, number> = {
  ok: 0,
  watch: 1,
  upgrade_soon: 2,
  upgrade_now: 3,
};

function worstSignal(a: CapacitySignal, b: CapacitySignal): CapacitySignal {
  return SIGNAL_RANK[a] >= SIGNAL_RANK[b] ? a : b;
}

function percentile(values: number[], p: number): number {
  const clean = values.filter((v) => Number.isFinite(v));
  if (!clean.length) return 0;
  const sorted = [...clean].sort((a, b) => a - b);
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1
  );
  return sorted[Math.max(0, idx)] ?? 0;
}

function maxOf(values: number[]): number {
  const clean = values.filter((v) => Number.isFinite(v));
  return clean.length ? Math.max(...clean) : 0;
}

export function assessCapacity(input: CapacityAssessInput): {
  overall: CapacitySignal;
  findings: CapacityFinding[];
  stats: {
    sampleCount: number;
    windowHours: number;
    ramUsedPctP95: number;
    ramUsedPctMax: number;
    cpuPctP95: number;
    diskUsedPct: number;
    swapUsedMbP95: number;
    egressMbpsP95: number;
    egressMbpsPeak: number;
    streamActiveP95: number;
    streamRpmP95: number;
    estimatedConcurrentHdStreams: number;
  };
} {
  const samples = input.samples;
  const minSamples = input.minSamples ?? 48;
  const vps = input.vps;
  const bandwidthMbps = vps.bandwidthMbps ?? 400;

  const ram = samples.map((s) => s.ramUsedPct ?? NaN);
  const cpu = samples.map((s) => s.cpuPct ?? NaN);
  const disk = samples.map((s) => s.diskUsedPct ?? NaN);
  const swap = samples.map((s) => s.swapUsedMb ?? NaN);
  const egress = samples.map((s) => s.egressMbps ?? NaN);
  const streamActive = samples.map((s) => s.streamActive ?? NaN);
  const streamRpm = samples.map((s) => s.streamRpm ?? NaN);

  const ramUsedPctP95 = percentile(ram, 95);
  const ramUsedPctMax = maxOf(ram);
  const cpuPctP95 = percentile(cpu, 95);
  const diskUsedPct = maxOf(disk);
  const swapUsedMbP95 = percentile(swap, 95);
  const egressMbpsP95 = percentile(egress, 95);
  const egressMbpsPeak = maxOf(egress);
  const streamActiveP95 = percentile(streamActive, 95);
  const streamRpmP95 = percentile(streamRpm, 95);

  const appPeak = input.app?.streamActivePeak ?? 0;
  const effectiveStreamP95 = Math.max(streamActiveP95, appPeak);
  const estimatedConcurrentHdStreams = Math.max(
    1,
    Math.round(egressMbpsPeak / 4)
  );

  let windowHours = 0;
  if (samples.length >= 2) {
    const t0 = Date.parse(samples[0]!.ts);
    const t1 = Date.parse(samples[samples.length - 1]!.ts);
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 > t0) {
      windowHours = (t1 - t0) / 3_600_000;
    }
  }

  const stats = {
    sampleCount: samples.length,
    windowHours: Number(windowHours.toFixed(1)),
    ramUsedPctP95,
    ramUsedPctMax,
    cpuPctP95,
    diskUsedPct,
    swapUsedMbP95,
    egressMbpsP95,
    egressMbpsPeak,
    streamActiveP95: effectiveStreamP95,
    streamRpmP95: Math.max(streamRpmP95, input.app?.streamRpmP95 ?? 0),
    estimatedConcurrentHdStreams,
  };

  const findings: CapacityFinding[] = [];

  if (samples.length < minSamples) {
    findings.push({
      id: "baseline",
      signal: "ok",
      title: "Collecting baseline",
      detail: `Only ${samples.length} samples so far (need ~${minSamples} for reliable upgrade signals). Monitoring is working — check again after 24h.`,
    });
    return { overall: "ok", findings, stats };
  }

  if (ramUsedPctMax >= 95 || ramUsedPctP95 >= 90) {
    findings.push({
      id: "ram",
      signal: "upgrade_now",
      title: "RAM critically high",
      detail: `RAM p95 ${ramUsedPctP95.toFixed(0)}%, peak ${ramUsedPctMax.toFixed(0)}%. Risk of OOM during deploys or traffic spikes. Upgrade RAM or reduce concurrent load.`,
    });
  } else if (ramUsedPctP95 >= 75) {
    findings.push({
      id: "ram",
      signal: ramUsedPctP95 >= 85 ? "upgrade_soon" : "watch",
      title: "RAM trending high",
      detail: `RAM p95 ${ramUsedPctP95.toFixed(0)}% on a ${vps.ramGb ?? "?"} GB plan. Fine for now, but builds + streaming together may spike higher.`,
    });
  }

  if (swapUsedMbP95 >= 1024) {
    findings.push({
      id: "swap",
      signal: "upgrade_soon",
      title: "Heavy swap use",
      detail: `Swap p95 ${(swapUsedMbP95 / 1024).toFixed(1)} GB — the box is memory-starved under load.`,
    });
  } else if (swapUsedMbP95 >= 256) {
    findings.push({
      id: "swap",
      signal: "watch",
      title: "Swap in use",
      detail: `Swap p95 ${swapUsedMbP95.toFixed(0)} MB — occasional memory pressure.`,
    });
  }

  if (cpuPctP95 >= 90) {
    findings.push({
      id: "cpu",
      signal: "upgrade_soon",
      title: "CPU saturated",
      detail: `CPU p95 ${cpuPctP95.toFixed(0)}%. Check VOD transcode jobs or many concurrent proxy streams.`,
    });
  } else if (cpuPctP95 >= 70) {
    findings.push({
      id: "cpu",
      signal: "watch",
      title: "CPU elevated",
      detail: `CPU p95 ${cpuPctP95.toFixed(0)}% — watch during peak viewing hours.`,
    });
  }

  if (diskUsedPct >= 95) {
    findings.push({
      id: "disk",
      signal: "upgrade_now",
      title: "Disk almost full",
      detail: `Disk ${diskUsedPct.toFixed(0)}% used. Prune transcode cache / old backups or expand storage.`,
    });
  } else if (diskUsedPct >= 85) {
    findings.push({
      id: "disk",
      signal: "upgrade_soon",
      title: "Disk filling up",
      detail: `Disk ${diskUsedPct.toFixed(0)}% used.`,
    });
  } else if (diskUsedPct >= 70) {
    findings.push({
      id: "disk",
      signal: "watch",
      title: "Disk headroom shrinking",
      detail: `Disk ${diskUsedPct.toFixed(0)}% used.`,
    });
  }

  const bwRatioPeak = egressMbpsPeak / bandwidthMbps;
  const bwRatioP95 = egressMbpsP95 / bandwidthMbps;

  if (bwRatioPeak >= 0.85) {
    findings.push({
      id: "bandwidth",
      signal: "upgrade_soon",
      title: "Network bandwidth near cap",
      detail: `Peak egress ${egressMbpsPeak.toFixed(0)} Mbps (~${(bwRatioPeak * 100).toFixed(0)}% of ${bandwidthMbps} Mbps plan). Upgrade bandwidth or split stream proxy.`,
    });
  } else if (bwRatioP95 >= 0.6) {
    findings.push({
      id: "bandwidth",
      signal: "watch",
      title: "Sustained egress elevated",
      detail: `Egress p95 ${egressMbpsP95.toFixed(0)} Mbps — roughly ${estimatedConcurrentHdStreams} HD streams worth of proxy traffic.`,
    });
  }

  if (effectiveStreamP95 >= 12) {
    findings.push({
      id: "streams",
      signal: "upgrade_soon",
      title: "Many concurrent streams",
      detail: `~${effectiveStreamP95.toFixed(0)} concurrent proxy streams (p95). Public multi-tenant load — consider a larger plan or dedicated stream edge.`,
    });
  } else if (effectiveStreamP95 >= 6) {
    findings.push({
      id: "streams",
      signal: "watch",
      title: "Moderate concurrent streams",
      detail: `~${effectiveStreamP95.toFixed(0)} concurrent proxy streams (p95).`,
    });
  }

  if (vps.trafficTbMonth && samples.length >= 2) {
    // Monthly projection handled in vps-capacity-report.ts from netTxBytes deltas.
  }

  if (!findings.length) {
    findings.push({
      id: "healthy",
      signal: "ok",
      title: "Within capacity",
      detail: `No upgrade signals over ${stats.windowHours}h window. VPS looks appropriately sized for current load.`,
    });
  }

  let overall: CapacitySignal = "ok";
  for (const f of findings) {
    overall = worstSignal(overall, f.signal);
  }

  return { overall, findings, stats };
}
