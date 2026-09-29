"use client";

import { CHUNK_RELOAD_SESSION_KEY } from "@/lib/chunk-load-recovery";
import { reportUxPageReload } from "@/lib/ux-frustration-telemetry";
import { useEffect } from "react";

/**
 * A few full reloads of the same page usually mean the screen failed to load
 * or playback never started. One automatic chunk reload after a deploy is ignored.
 */
export function UxFrustrationMonitor() {
  useEffect(() => {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    let chunkReload = false;
    try {
      chunkReload = sessionStorage.getItem(CHUNK_RELOAD_SESSION_KEY) === "1";
    } catch {
      chunkReload = false;
    }
    reportUxPageReload({
      path: window.location.pathname,
      isReload: nav?.type === "reload" && !chunkReload,
    });
  }, []);

  return null;
}
