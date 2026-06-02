"use client";

import { getAppVersionLabel } from "@/lib/app-version";

/**
 * Subtle build label for support / external screenshots (non-interactive).
 * Fixed so it remains visible during fullscreen playback.
 */
export function AppVersionBadge() {
  return (
    <div
      className="fixed bottom-1 right-2 z-[200] pointer-events-none select-none"
      aria-hidden
    >
      <span className="text-[9px] leading-none font-mono text-white/35 tracking-tight">
        {getAppVersionLabel()}
      </span>
    </div>
  );
}
