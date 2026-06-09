"use client";

import { create } from "zustand";

type ToastState = {
  message: string | null;
  show: (message: string) => void;
  clear: () => void;
};

let hideTimer: ReturnType<typeof setTimeout> | null = null;

export const useToast = create<ToastState>((set) => ({
  message: null,
  show: (message) => {
    if (hideTimer) clearTimeout(hideTimer);
    set({ message });
    hideTimer = setTimeout(() => {
      hideTimer = null;
      set({ message: null });
    }, 2600);
  },
  clear: () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
    set({ message: null });
  },
}));
