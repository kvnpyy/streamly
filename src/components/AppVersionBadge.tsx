"use client";

import { getAppVersionLabel } from "@/lib/app-version";
import { MOBILE_BOTTOM_NAV_CLEARANCE } from "@/lib/shell-layout";
import { cn } from "@/lib/utils";
import { usePlayer } from "@/store/player";
import Link from "next/link";
import type { CSSProperties } from "react";

/**
 * Subtle build label — links to /changelog for release notes.
 * Fixed so it remains visible during fullscreen playback.
 */
export function AppVersionBadge() {
  const label = getAppVersionLabel();
  const playerOpen = usePlayer((s) => s.open);
  if (playerOpen) return null;
  return (
    <div
      className={cn(
        "fixed right-2 z-[90] pointer-events-auto",
        "max-lg:bottom-[var(--mobile-bottom-nav-clearance)] lg:bottom-1"
      )}
      style={
        {
          ["--mobile-bottom-nav-clearance" as string]: MOBILE_BOTTOM_NAV_CLEARANCE,
        } as CSSProperties
      }
    >
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
