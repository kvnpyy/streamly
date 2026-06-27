"use client";

import { isLibraryHomePath } from "@/lib/home-route";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import {
  prefetchTvHubCatalogs,
  prefetchTvHubRoutes,
} from "@/lib/tv-hub-prefetch";
import { useTvSimpleMode } from "@/lib/tv-simple-mode";
import { useAuth } from "@/store/auth";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter, usePathname } from "next/navigation";
import { useEffect } from "react";

const HUB_WARM_DELAY_MS = 280;

/**
 * TV simple hub: warm route chunks + slim catalogs while the user reads the menu.
 * (CatalogPrefetch is off in tvSimple mode — without this, every tile tap is cold.)
 */
export function TvHubPrefetch() {
  const tvSimple = useTvSimpleMode();
  const creds = useAuth((s) => s.creds);
  const qc = useQueryClient();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!tvSimple || !creds || !isLibraryHomePath(pathname)) return;
    return scheduleWhenIdle(() => {
      prefetchTvHubCatalogs(creds, qc);
      prefetchTvHubRoutes((href) => router.prefetch(href));
    }, HUB_WARM_DELAY_MS);
  }, [tvSimple, creds, pathname, qc, router]);

  return null;
}
