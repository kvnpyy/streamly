const STORAGE_KEY = "iptv-player-playback-speed-v1";

export const PLAYBACK_SPEED_OPTIONS = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2,
] as const;

export type PlaybackSpeedOption = (typeof PLAYBACK_SPEED_OPTIONS)[number];

export function normalizePlaybackSpeed(rate: number): PlaybackSpeedOption {
  if (!Number.isFinite(rate)) return 1;
  let best: PlaybackSpeedOption = 1;
  let bestDelta = Infinity;
  for (const option of PLAYBACK_SPEED_OPTIONS) {
    const delta = Math.abs(option - rate);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = option;
    }
  }
  return best;
}

export function playbackSpeedLabel(rate: number): string {
  const normalized = normalizePlaybackSpeed(rate);
  if (normalized === 1) return "Normal";
  return `${normalized}×`;
}

export function readPreferredPlaybackSpeed(): PlaybackSpeedOption {
  if (typeof window === "undefined") return 1;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw == null || raw === "") return 1;
    return normalizePlaybackSpeed(parseFloat(raw));
  } catch {
    return 1;
  }
}

export function writePreferredPlaybackSpeed(rate: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      String(normalizePlaybackSpeed(rate))
    );
  } catch {
    /* quota / private mode */
  }
}
