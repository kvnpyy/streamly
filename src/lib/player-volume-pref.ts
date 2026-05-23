const STORAGE_KEY = "iptv-player-preferred-volume-v1";

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(1, Math.max(0, n));
}

/** Last in-player volume the user set (persists across sessions). */
export function readPreferredPlayerVolume(): number | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return undefined;
    const n = parseFloat(raw);
    if (!Number.isFinite(n)) return undefined;
    return clamp01(n);
  } catch {
    return undefined;
  }
}

export function writePreferredPlayerVolume(volume: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(clamp01(volume)));
  } catch {
    /* quota / private mode */
  }
}
