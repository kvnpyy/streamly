"use client";

import { catalogKeys } from "@/lib/catalog-queries";
import { SHELL_DESKTOP_MIN_WIDTH_PX } from "@/lib/shell-layout";
import { isLibraryHomePath } from "@/lib/home-route";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import { slimLiveCatalogQueryOptions } from "@/lib/live-catalog-query";
import { useAuth } from "@/store/auth";
import { useQueryClient } from "@tanstack/react-query";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const HOME_PREFETCH_DELAY_MS = 45_000;
const LIVE_ROUTE_PREFETCH_DELAY_MS = 400;
const LIVE_ROUTE_MOBILE_PREFETCH_DELAY_MS = 3_500;
const ROUTE_PREFETCH_MOBILE_DELAY_MS = 2_400;

function prefetchDelayMs(pathname: string): number {
  if (typeof window === "undefined") return 1_200;
  const mobile = window.matchMedia(
    `(max-width: ${SHELL_DESKTOP_MIN_WIDTH_PX - 1}px)`
  ).matches;
  if (pathname === "/app/live" || pathname.startsWith("/app/live/")) {
    return mobile ? LIVE_ROUTE_MOBILE_PREFETCH_DELAY_MS : LIVE_ROUTE_PREFETCH_DELAY_MS;
  }
  return mobile ? ROUTE_PREFETCH_MOBILE_DELAY_MS : 1_200;
}

/**
 * Warms the live catalog cache after sign-in so `/app/live` is fast.
 * Never prefetches on Library (`/app`) — parsing multi‑MB JSON there caused
 * "Page Unresponsive" hangs.
 */
export function CatalogPrefetch() {
  const creds = useAuth((s) => s.creds);
  const qc = useQueryClient();
  const pathname = usePathname();
  const onLibraryHome = isLibraryHomePath(pathname);
  const wasOnLibraryRef = useRef(onLibraryHome);

  const prefetch = () => {
    if (!creds) return;
    const key = catalogKeys.live(creds);
    if (qc.getQueryState(key)?.data) return;
    void qc.prefetchQuery(slimLiveCatalogQueryOptions(creds));
  };

  useEffect(() => {
    if (!creds || onLibraryHome) return;

    const delay = prefetchDelayMs(pathname);

    return scheduleWhenIdle(prefetch, delay);
  }, [creds, onLibraryHome, pathname, qc]);

  /** After leaving Library, warm catalog once the user is browsing elsewhere. */
  useEffect(() => {
    if (!creds) return;
    const wasLibrary = wasOnLibraryRef.current;
    wasOnLibraryRef.current = onLibraryHome;
    if (!wasLibrary || onLibraryHome) return;
    return scheduleWhenIdle(prefetch, 600);
  }, [creds, onLibraryHome, qc]);

  /** Optional background warm while staying on Library (long idle only). */
  useEffect(() => {
    if (!creds || !onLibraryHome) return;
    return scheduleWhenIdle(prefetch, HOME_PREFETCH_DELAY_MS);
  }, [creds, onLibraryHome, qc]);

  return null;
}
