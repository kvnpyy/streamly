"use client";

import { liveChannelFlipDebounceMs } from "@/lib/tv-playback-tune";
import { create } from "zustand";

export type PlayerSource = {
  kind: "live" | "movie" | "series";
  id: number;
  /** Xtream stream id for …/movie|series/…/ID.ext when it differs from `id` (series uses `id` as series_id). */
  streamId?: number;
  title: string;
  subtitle?: string;
  url: string;
  poster?: string;
  containerExt?: string;
};

function sourcesMatchInPlaylist(needle: PlayerSource, item: PlayerSource): boolean {
  if (needle.kind !== item.kind) return false;
  if (needle.kind === "series") return needle.url === item.url;
  return needle.id === item.id;
}

/**
 * Optional playlist for flip navigation: live channels or series episodes.
 */
export type PlayerPlaylist =
  | { kind: "live"; items: PlayerSource[] }
  | { kind: "series"; items: PlayerSource[] };

export type PlayerFlipOptions = {
  /** Skip live zap debounce (toolbar buttons / explicit OK on a flip control). */
  immediate?: boolean;
};

type PlayerState = {
  current: PlayerSource | null;
  open: boolean;
  playlist: PlayerPlaylist | null;
  /** Index of `current` inside the playlist, or -1 if not in one. */
  index: number;
  play: (s: PlayerSource, opts?: { playlist?: PlayerPlaylist }) => void;
  flip: (delta: number, opts?: PlayerFlipOptions) => void;
  close: () => void;
};

function resolvePlaylistIndex(state: PlayerState): number {
  const { playlist, index, current } = state;
  if (!playlist || playlist.items.length === 0) return -1;
  if (
    index >= 0 &&
    index < playlist.items.length &&
    (!current || sourcesMatchInPlaylist(current, playlist.items[index]!))
  ) {
    return index;
  }
  if (current) {
    const found = playlist.items.findIndex((p) =>
      sourcesMatchInPlaylist(current, p)
    );
    if (found >= 0) return found;
  }
  return -1;
}

const LIVE_FLIP_DEBOUNCE_MS =
  typeof navigator !== "undefined"
    ? liveChannelFlipDebounceMs(navigator.userAgent)
    : 280;
let liveFlipDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let pendingLiveFlipDelta = 0;

function clearLiveFlipTimer(): void {
  if (liveFlipDebounceTimer) {
    clearTimeout(liveFlipDebounceTimer);
    liveFlipDebounceTimer = null;
  }
}

function clearLiveFlipDebounce(): void {
  clearLiveFlipTimer();
  pendingLiveFlipDelta = 0;
}

function applyPendingLiveFlip(
  set: (
    partial:
      | Partial<PlayerState>
      | ((state: PlayerState) => Partial<PlayerState>)
  ) => void,
  get: () => PlayerState
): void {
  const state = get();
  const { playlist } = state;
  if (!playlist || playlist.items.length === 0) {
    pendingLiveFlipDelta = 0;
    return;
  }
  const index = resolvePlaylistIndex(state);
  if (index < 0) {
    pendingLiveFlipDelta = 0;
    return;
  }
  const n = playlist.items.length;
  const next = ((index + pendingLiveFlipDelta) % n + n) % n;
  pendingLiveFlipDelta = 0;
  set({ current: playlist.items[next], index: next });
}

function applyFlipDelta(
  set: (
    partial:
      | Partial<PlayerState>
      | ((state: PlayerState) => Partial<PlayerState>)
  ) => void,
  get: () => PlayerState,
  delta: number
): void {
  const state = get();
  const { playlist } = state;
  if (!playlist || playlist.items.length === 0) return;
  const index = resolvePlaylistIndex(state);
  if (index < 0) return;
  const n = playlist.items.length;
  const next = ((index + delta) % n + n) % n;
  set({ current: playlist.items[next], index: next });
}

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  open: false,
  playlist: null,
  index: -1,
  play: (s, opts) => {
    clearLiveFlipDebounce();
    const playlist = opts?.playlist ?? null;
    let index = -1;
    if (playlist) {
      index = playlist.items.findIndex((p) => sourcesMatchInPlaylist(s, p));
    }
    set({ current: s, open: true, playlist, index });
  },
  flip: (delta, opts) => {
    const { playlist, open } = get();
    if (!playlist || playlist.items.length === 0) return;
    if (resolvePlaylistIndex(get()) < 0) return;
    if (playlist.kind === "live" && open && !opts?.immediate) {
      pendingLiveFlipDelta += delta;
      clearLiveFlipTimer();
      liveFlipDebounceTimer = setTimeout(() => {
        liveFlipDebounceTimer = null;
        applyPendingLiveFlip(set, get);
      }, LIVE_FLIP_DEBOUNCE_MS);
      return;
    }
    applyFlipDelta(set, get, delta);
  },
  close: () => {
    clearLiveFlipDebounce();
    set({ open: false });
  },
}));
