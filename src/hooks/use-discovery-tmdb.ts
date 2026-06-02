"use client";

import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import type { DiscoveryShelvesApiResponse } from "@/lib/discovery/types";
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

export function useDiscoveryTmdb(region = "US") {
  const enabled = isDiscoveryShelvesEnabled();
  return useQuery({
    queryKey: ["discovery-shelves", region],
    queryFn: ({ signal }) => fetchDiscoveryShelves(region, signal),
    enabled,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
