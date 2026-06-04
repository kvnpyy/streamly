"use client";

import { create } from "zustand";

/**
 * Survives AppShell unmounting the Live browse tree during playback so closing
 * the player can restore the open category channel list.
 */
type LiveBrowseUiState = {
  openCategoryId: string | null;
  setOpenCategoryId: (id: string | null) => void;
};

export const useLiveBrowseUi = create<LiveBrowseUiState>((set) => ({
  openCategoryId: null,
  setOpenCategoryId: (id) => set({ openCategoryId: id }),
}));
