"use client";

import { scheduleWhenIdle } from "@/lib/defer-idle";
import { useTvSimpleMode } from "@/lib/tv-simple-mode";
import { useEffect, useState } from "react";

/** Defer multi‑MB VOD/series catalog fetch until after first paint + idle. */
export function useCatalogPageReady(idleMs = 320, maxWaitMs = 2_800): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const finish = () => {
      if (!cancelled) setReady(true);
    };
    const cancelIdle = scheduleWhenIdle(finish, idleMs);
    const force = window.setTimeout(finish, maxWaitMs);
    return () => {
      cancelled = true;
      cancelIdle();
      window.clearTimeout(force);
    };
  }, [idleMs, maxWaitMs]);

  return ready;
}

/** TV simple: catalogs are prefetched on the hub — start fetch almost immediately. */
export function useTvCatalogPageReady(): boolean {
  const tvSimple = useTvSimpleMode();
  return useCatalogPageReady(tvSimple ? 48 : 320, tvSimple ? 1_200 : 2_800);
}
