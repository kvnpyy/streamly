"use client";

import { loadHlsModule, type HlsConstructor } from "@/lib/lazy-hls";
import { useEffect, useState } from "react";

/** Loads hls.js when the player opens (or when `enabled` is true). */
export function useHlsRuntime(enabled: boolean): HlsConstructor | null {
  const [Hls, setHls] = useState<HlsConstructor | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadHlsModule().then((lib) => {
      if (!cancelled) setHls(() => lib);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return Hls;
}
