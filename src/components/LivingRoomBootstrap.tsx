"use client";

import { isCoarsePointerLargeScreen } from "@/lib/living-room-detect";
import { usePrefs } from "@/store/preferences";
import { useEffect } from "react";

const BOOT_KEY = "streamly-living-room-boot";

/**
 * On a TV-sized screen with a remote (coarse pointer), enable Comfort layout once
 * so typography and TV home hub activate without digging through Settings.
 */
export function LivingRoomBootstrap() {
  const comfortTvBrowsing = usePrefs((s) => s.comfortTvBrowsing);
  const setComfortTvBrowsing = usePrefs((s) => s.setComfortTvBrowsing);

  useEffect(() => {
    if (comfortTvBrowsing) return;
    if (!isCoarsePointerLargeScreen()) return;
    try {
      if (localStorage.getItem(BOOT_KEY) === "1") return;
      setComfortTvBrowsing(true);
      localStorage.setItem(BOOT_KEY, "1");
    } catch {
      setComfortTvBrowsing(true);
    }
  }, [comfortTvBrowsing, setComfortTvBrowsing]);

  return null;
}
