"use client";

import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import type { DiscoverySportsApiResponse } from "@/lib/discovery/sports-types";
import { useQuery } from "@tanstack/react-query";

async function fetchDiscoverySports(
  region: string,
  signal?: AbortSignal
): Promise<DiscoverySportsApiResponse> {
  const res = await fetch(
    `/api/discovery/sports?region=${encodeURIComponent(region)}`,
    { signal }
  );
  if (!res.ok) {
    throw new Error(`Discovery sports failed: ${res.status}`);
  }
  return res.json() as Promise<DiscoverySportsApiResponse>;
}

export function useDiscoverySports(region = "US") {
  const enabled = isDiscoveryShelvesEnabled();
  return useQuery({
    queryKey: ["discovery-sports", region],
    queryFn: ({ signal }) => fetchDiscoverySports(region, signal),
    enabled,
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}
