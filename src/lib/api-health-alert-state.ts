import type { ApiHealthSignal } from "@/lib/assess-api-health";

export type ApiHealthAlertState = {
  lastNotifiedAt: string | null;
  lastNotifiedSignal: ApiHealthSignal | null;
};

const COOLDOWN_MS: Record<ApiHealthSignal, number> = {
  ok: 0,
  watch: 6 * 60 * 60_000,
  alert: 2 * 60 * 60_000,
};

export function parseApiHealthAlertState(raw: unknown): ApiHealthAlertState {
  if (!raw || typeof raw !== "object") {
    return { lastNotifiedAt: null, lastNotifiedSignal: null };
  }
  const o = raw as Record<string, unknown>;
  const signal = o.lastNotifiedSignal;
  return {
    lastNotifiedAt:
      typeof o.lastNotifiedAt === "string" ? o.lastNotifiedAt : null,
    lastNotifiedSignal:
      signal === "watch" || signal === "alert" || signal === "ok"
        ? signal
        : null,
  };
}

export function shouldSendApiHealthAlert(opts: {
  overall: ApiHealthSignal;
  state: ApiHealthAlertState;
  now?: number;
}): boolean {
  const { overall, state } = opts;
  const now = opts.now ?? Date.now();
  if (overall === "ok") return false;

  if (!state.lastNotifiedAt) return true;

  const prev = state.lastNotifiedSignal ?? "watch";
  const rank = (s: ApiHealthSignal) => (s === "alert" ? 2 : s === "watch" ? 1 : 0);
  if (rank(overall) > rank(prev)) return true;

  const last = Date.parse(state.lastNotifiedAt);
  if (!Number.isFinite(last)) return true;

  return now - last >= COOLDOWN_MS[overall];
}
