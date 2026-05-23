"use client";

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

type PlayerState = {
  current: PlayerSource | null;
  open: boolean;
  playlist: PlayerPlaylist | null;
  /** Index of `current` inside the playlist, or -1 if not in one. */
  index: number;
  play: (s: PlayerSource, opts?: { playlist?: PlayerPlaylist }) => void;
  flip: (delta: number) => void;
  close: () => void;
};

export const usePlayer = create<PlayerState>((set, get) => ({
  current: null,
  open: false,
  playlist: null,
  index: -1,
  play: (s, opts) => {
    const playlist = opts?.playlist ?? null;
    let index = -1;
    if (playlist) {
      index = playlist.items.findIndex((p) => sourcesMatchInPlaylist(s, p));
    }
    set({ current: s, open: true, playlist, index });
  },
  flip: (delta) => {
    const { playlist, index } = get();
    if (!playlist || playlist.items.length === 0 || index < 0) return;
    const n = playlist.items.length;
    const next = ((index + delta) % n + n) % n;
    set({ current: playlist.items[next], index: next });
  },
  close: () => set({ open: false }),
}));
