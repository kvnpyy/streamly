"use client";

import { usePlayer } from "@/store/player";

/** True while the fullscreen player overlay is open — pause catalog EPG/scroll work. */
export function usePlayerOpen(): boolean {
  return usePlayer((s) => s.open);
}
