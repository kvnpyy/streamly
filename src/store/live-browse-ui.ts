"use client";

import { create } from "zustand";

/**
 * Survives AppShell unmounting the Live browse tree during playback so closing
 * the player can restore the open category channel list.
 */
type LiveBrowseUiState = {
  openCategoryId: string | null;
  openCategoryTitle: string | null;
  openCategory: (id: string, title: string) => void;
  closeCategory: () => void;
};

export const useLiveBrowseUi = create<LiveBrowseUiState>((set) => ({
  openCategoryId: null,
  openCategoryTitle: null,
  openCategory: (id, title) =>
    set({ openCategoryId: id, openCategoryTitle: title }),
  closeCategory: () =>
    set({ openCategoryId: null, openCategoryTitle: null }),
}));
