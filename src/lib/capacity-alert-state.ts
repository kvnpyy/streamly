import type { CapacitySignal } from "@/lib/capacity-assess";

const SIGNAL_RANK: Record<CapacitySignal, number> = {
  ok: 0,
  watch: 1,
  upgrade_soon: 2,
  upgrade_now: 3,
};

export type CapacityAlertState = {
  lastNotifiedAt: string | null;
  lastNotifiedSignal: CapacitySignal | null;
};

export function shouldSendCapacityAlert(opts: {
  overall: CapacitySignal;
  minSignal: CapacitySignal;
  isBaseline: boolean;
  state: CapacityAlertState;
  nowMs?: number;
  cooldownMs?: number;
}): boolean {
  if (opts.isBaseline) return false;
  if (SIGNAL_RANK[opts.overall] < SIGNAL_RANK[opts.minSignal]) return false;

  const now = opts.nowMs ?? Date.now();
  const cooldown = opts.cooldownMs ?? 24 * 3_600_000;
  const last = opts.state.lastNotifiedAt
    ? Date.parse(opts.state.lastNotifiedAt)
    : NaN;
  const lastSignal = opts.state.lastNotifiedSignal;

  if (!lastSignal || !Number.isFinite(last)) return true;
  if (SIGNAL_RANK[opts.overall] > SIGNAL_RANK[lastSignal]) return true;
  if (opts.overall !== lastSignal) return true;
  return now - last >= cooldown;
}

export function parseCapacityAlertState(raw: unknown): CapacityAlertState {
  if (!raw || typeof raw !== "object") {
    return { lastNotifiedAt: null, lastNotifiedSignal: null };
  }
  const o = raw as Record<string, unknown>;
  const sig = o.lastNotifiedSignal;
  const valid: CapacitySignal[] = [
    "ok",
    "watch",
    "upgrade_soon",
    "upgrade_now",
  ];
  return {
    lastNotifiedAt:
      typeof o.lastNotifiedAt === "string" ? o.lastNotifiedAt : null,
    lastNotifiedSignal: valid.includes(sig as CapacitySignal)
      ? (sig as CapacitySignal)
      : null,
  };
}
