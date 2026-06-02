"use client";

import {
  isPerfHudEnabled,
  subscribePerformanceMonitor,
  type PerfSnapshot,
} from "@/lib/performance-monitor";
import { useEffect, useState } from "react";

/** Dev/prod overlay — set NEXT_PUBLIC_PERF_HUD=1 */
export function PerformanceHud() {
  const [snap, setSnap] = useState<PerfSnapshot | null>(null);

  useEffect(() => {
    if (!isPerfHudEnabled()) return;
    return subscribePerformanceMonitor(setSnap);
  }, []);

  if (!isPerfHudEnabled() || !snap) return null;

  const fpsTone =
    snap.fps >= 55 ? "text-emerald-400" : snap.fps >= 40 ? "text-amber-300" : "text-red-400";

  return (
    <div
      className="fixed bottom-20 right-2 z-[9999] pointer-events-none font-mono text-[10px] leading-relaxed rounded-lg border border-white/15 bg-black/75 text-white/90 px-2 py-1.5 shadow-lg backdrop-blur-sm md:bottom-4"
      aria-hidden
    >
      <div className={fpsTone}>FPS {snap.fps}</div>
      <div>
        Long tasks (1m): {snap.longTasks1m}
        {snap.lastLongTaskMs > 0 ? ` · last ${snap.lastLongTaskMs}ms` : ""}
      </div>
      {snap.jsHeapUsedMb != null && (
        <div>
          Heap {snap.jsHeapUsedMb}MB
          {snap.jsHeapLimitMb != null ? ` / ${snap.jsHeapLimitMb}MB` : ""}
        </div>
      )}
      {snap.lcpMs != null && <div>LCP {snap.lcpMs}ms</div>}
      {snap.inpMs != null && <div>INP ~{snap.inpMs}ms</div>}
    </div>
  );
}
