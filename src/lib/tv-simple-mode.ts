"use client";

import { isLivingRoomClient } from "@/lib/living-room-detect";
import { isLivingRoomClientSnapshot, isLivingRoomServerSnapshot } from "@/lib/tv-server-hints";
import { useTvServerHints } from "@/lib/tv-server-hints";
import { usePrefs } from "@/store/preferences";
import { useSyncExternalStore } from "react";

function subscribeLivingRoom(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(pointer: coarse) and (min-width: 1024px)");
  const onChange = () => callback();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** TV / living-room clients get the minimal hub + lightweight browse UI. */
export function useTvSimpleMode(): boolean {
  const hints = useTvServerHints();
  const comfortTvBrowsing = usePrefs((s) => s.comfortTvBrowsing);
  return useSyncExternalStore(
    subscribeLivingRoom,
    () => isLivingRoomClientSnapshot(hints, comfortTvBrowsing),
    () => isLivingRoomServerSnapshot(hints)
  );
}

export function isTvSimpleModeClient(comfortTvBrowsing = false): boolean {
  if (typeof window === "undefined") return false;
  return isLivingRoomClient(comfortTvBrowsing);
}
