"use client";

import { usePlayer } from "@/store/player";
import { useEffect } from "react";

/** True while the fullscreen player overlay is open — pause catalog EPG/scroll work. */
export function usePlayerOpen(): boolean {
  return usePlayer((s) => s.open);
}

/** Sync `data-player-open` on `<html>` so fixed chrome can hide via CSS during playback. */
export function usePlayerDocumentOpen(): void {
  const open = usePlayer((s) => s.open);

  useEffect(() => {
    const root = document.documentElement;
    if (open) {
      root.dataset.playerOpen = "true";
      return () => {
        delete root.dataset.playerOpen;
      };
    }
    delete root.dataset.playerOpen;
    return undefined;
  }, [open]);
}
