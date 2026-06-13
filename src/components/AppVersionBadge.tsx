"use client";

import { getAppVersionLabel } from "@/lib/app-version";
import Link from "next/link";

/**
 * Subtle build label — links to /changelog for release notes.
 * Fixed so it remains visible during fullscreen playback.
 */
export function AppVersionBadge() {
  const label = getAppVersionLabel();
  return (
    <div className="fixed bottom-1 right-2 z-[200]">
      <Link
        href="/changelog"
        title="What's new — release notes"
        className="text-[9px] leading-none font-mono text-white/35 hover:text-white/55 tracking-tight px-1 py-0.5 rounded transition-colors"
        aria-label={`${label} — view changelog`}
      >
        {label}
      </Link>
    </div>
  );
}
