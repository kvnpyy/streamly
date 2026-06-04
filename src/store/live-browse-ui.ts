"use client";

import { create } from "zustand";

export type ShelfEpgHint = { streamId: number; title: string };

/**
 * Survives AppShell unmounting the Live browse tree during playback so closing
 * the player can restore the open category channel list.
 */
type LiveBrowseUiState = {
  openCategoryId: string | null;
  openCategoryTitle: string | null;
  /** Programme titles from visible shelf rows (feeds Trending on TV before localStorage warms). */
  shelfEpgHints: ShelfEpgHint[];
  openCategory: (id: string, title: string) => void;
  closeCategory: () => void;
  setShelfEpgHints: (hints: ShelfEpgHint[]) => void;
};

export const useLiveBrowseUi = create<LiveBrowseUiState>((set) => ({
  openCategoryId: null,
  openCategoryTitle: null,
  shelfEpgHints: [],
  openCategory: (id, title) =>
    set({ openCategoryId: id, openCategoryTitle: title }),
  closeCategory: () =>
    set({ openCategoryId: null, openCategoryTitle: null }),
  setShelfEpgHints: (hints) => set({ shelfEpgHints: hints }),
}));
