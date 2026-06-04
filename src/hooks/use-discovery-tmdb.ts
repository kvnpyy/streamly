"use client";

import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import { resolveTmdbCountry } from "@/lib/discovery/tmdb-region";
import type { DiscoveryShelvesApiResponse } from "@/lib/discovery/types";
import type { TvRegion } from "@/lib/geo-continent";
import { useQuery } from "@tanstack/react-query";

async function fetchDiscoveryShelves(
  region: string,
  signal?: AbortSignal
): Promise<DiscoveryShelvesApiResponse> {
  const res = await fetch(
    `/api/discovery/shelves?region=${encodeURIComponent(region)}`,
    { signal }
  );
  if (!res.ok) {
    throw new Error(`Discovery shelves failed: ${res.status}`);
  }
  return res.json() as Promise<DiscoveryShelvesApiResponse>;
}

/** Pass a `TvRegion` or ISO country code (`US`, `GB`, …). */
export function useDiscoveryTmdb(tvRegionOrCountry?: TvRegion | string | null) {
  const tmdbCountry =
    typeof tvRegionOrCountry === "string" &&
    /^[A-Z]{2,3}$/i.test(tvRegionOrCountry.trim()) &&
    !tvRegionOrCountry.includes(" ")
      ? tvRegionOrCountry.trim().toUpperCase()
      : resolveTmdbCountry({ tvRegion: tvRegionOrCountry as TvRegion | null });
  const enabled = isDiscoveryShelvesEnabled();
  return useQuery({
    queryKey: ["discovery-shelves", tmdbCountry],
    queryFn: ({ signal }) => fetchDiscoveryShelves(tmdbCountry, signal),
    enabled,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
