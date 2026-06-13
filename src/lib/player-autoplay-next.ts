import type { PlayerPlaylist, PlayerSource } from "@/store/player";

/** Show the next-episode UI when this many seconds remain (Netflix-style pre-credits window). */
export const AUTOPLAY_TRIGGER_REMAINING_SEC = 15;

/** Countdown length before auto-advancing to the next episode. */
export const AUTOPLAY_COUNTDOWN_SEC = 5;

/** Ignore autoplay on clips shorter than this (seconds). */
export const AUTOPLAY_MIN_EPISODE_DURATION_SEC = 30;

export function episodeAutoplayKey(source: PlayerSource): string {
  return `${source.kind}:${source.url}`;
}

export function getSeriesNextEpisode(
  playlist: PlayerPlaylist | null,
  index: number
): PlayerSource | null {
  if (!playlist || playlist.kind !== "series") return null;
  if (index < 0 || index >= playlist.items.length - 1) return null;
  return playlist.items[index + 1] ?? null;
}

export function remainingPlaybackSec(
  durationSec: number,
  currentTimeSec: number
): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 0;
  if (!Number.isFinite(currentTimeSec) || currentTimeSec < 0) return durationSec;
  return Math.max(0, durationSec - currentTimeSec);
}

/** How many seconds before the end we should surface the next-episode UI. */
export function autoplayTriggerRemainingSec(durationSec: number): number {
  if (durationSec < AUTOPLAY_MIN_EPISODE_DURATION_SEC) return 0;
  if (durationSec < AUTOPLAY_TRIGGER_REMAINING_SEC * 2) {
    return Math.min(AUTOPLAY_TRIGGER_REMAINING_SEC, durationSec * 0.25);
  }
  return AUTOPLAY_TRIGGER_REMAINING_SEC;
}

export type AutoplayNextGateParams = {
  open: boolean;
  kind: PlayerSource["kind"] | undefined;
  playlist: PlayerPlaylist | null;
  index: number;
  durationSec: number;
  currentTimeSec: number;
  dismissedForEpisode: boolean;
  watchCreditsForEpisode: boolean;
  hasNextEpisode: boolean;
};

export function shouldOfferAutoplayNext(params: AutoplayNextGateParams): boolean {
  if (!params.open) return false;
  if (params.dismissedForEpisode || params.watchCreditsForEpisode) return false;
  if (params.kind !== "series") return false;
  if (!params.playlist || params.playlist.kind !== "series") return false;
  if (params.index < 0 || !params.hasNextEpisode) return false;

  const trigger = autoplayTriggerRemainingSec(params.durationSec);
  if (trigger <= 0) return false;

  const remaining = remainingPlaybackSec(
    params.durationSec,
    params.currentTimeSec
  );
  return remaining > 0 && remaining <= trigger;
}

export type AutoplayCountdownTickResult = {
  next: number | null;
  shouldAdvance: boolean;
};

/** Countdown seconds shown in the next-episode overlay (derived from playback position). */
export function autoplayDisplayCountdownSec(params: {
  durationSec: number;
  currentTimeSec: number;
  shouldOffer: boolean;
}): number | null {
  if (!params.shouldOffer) return null;
  const trigger = autoplayTriggerRemainingSec(params.durationSec);
  if (trigger <= 0) return null;
  const remaining = remainingPlaybackSec(
    params.durationSec,
    params.currentTimeSec
  );
  const raw = Math.ceil(remaining - (trigger - AUTOPLAY_COUNTDOWN_SEC));
  if (raw <= 0) return 0;
  return Math.min(AUTOPLAY_COUNTDOWN_SEC, raw);
}

/** One-second countdown tick for autoplay UI. */
export function tickAutoplayCountdown(
  current: number | null
): AutoplayCountdownTickResult {
  if (current == null) return { next: null, shouldAdvance: false };
  if (current <= 1) return { next: null, shouldAdvance: true };
  return { next: current - 1, shouldAdvance: false };
}

/** Whether playback ended and we should still advance (user didn't cancel / watch credits). */
export function shouldAutoplayOnEnded(params: {
  kind: PlayerSource["kind"] | undefined;
  playlist: PlayerPlaylist | null;
  index: number;
  dismissedForEpisode: boolean;
  watchCreditsForEpisode: boolean;
  hasNextEpisode: boolean;
}): boolean {
  if (params.dismissedForEpisode || params.watchCreditsForEpisode) return false;
  if (params.kind !== "series") return false;
  if (!params.playlist || params.playlist.kind !== "series") return false;
  if (params.index < 0 || !params.hasNextEpisode) return false;
  return true;
}
