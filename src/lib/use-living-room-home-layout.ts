"use client";

import { isLivingRoomClient } from "@/lib/living-room-detect";
import { detectTvBrowser } from "@/lib/tv-browser";
import { usePrefs } from "@/store/preferences";
import { useSyncExternalStore } from "react";

function subscribeCoarsePointer(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const mq = window.matchMedia("(pointer: coarse) and (min-width: 1024px)");
  const onChange = () => callback();
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function subscribeLivingRoom(callback: () => void) {
  const unsubCoarse = subscribeCoarsePointer(callback);
  return unsubCoarse;
}

/**
 * Living-room home hub: native TV browsers, Silk, Comfort layout, or
 * large screen + coarse pointer (typical TV browser with a remote).
 */
export function useLivingRoomHomeLayout(): boolean {
  const comfortTvBrowsing = usePrefs((s) => s.comfortTvBrowsing);

  return useSyncExternalStore(
    subscribeLivingRoom,
    () => isLivingRoomClient(comfortTvBrowsing),
    () => false
  );
}

/** Any UI that should use TV grids, focus targets, and EPG caps. */
export function useTvPresentation(): boolean {
  const comfortTvBrowsing = usePrefs((s) => s.comfortTvBrowsing);
  return useSyncExternalStore(
    subscribeLivingRoom,
    () => isLivingRoomClient(comfortTvBrowsing),
    () => false
  );
}

/** Native TV / Silk UA only (not coarse-pointer browser on TV). */
export function useNativeTvBrowser(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => detectTvBrowser(),
    () => false
  );
}
