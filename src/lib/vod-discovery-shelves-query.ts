import { catalogKeys } from "@/lib/catalog-queries";
import type { VodDiscoveryShelvesPayload } from "@/lib/vod-discovery-shelves-types";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { UseQueryOptions } from "@tanstack/react-query";

export type VodDiscoveryShelvesQueryParams = {
  hideAdult: boolean;
  parentalUnlocked: boolean;
  recentIds: number[];
  favoriteIds: number[];
  region?: string;
};

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

function buildQueryString(params: VodDiscoveryShelvesQueryParams): string {
  const qs = new URLSearchParams();
  if (params.hideAdult) qs.set("hideAdult", "1");
  if (params.parentalUnlocked) qs.set("parentalUnlocked", "1");
  if (params.recentIds.length) qs.set("recentIds", params.recentIds.join(","));
  if (params.favoriteIds.length) qs.set("favoriteIds", params.favoriteIds.join(","));
  if (params.region) qs.set("region", params.region);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function fetchVodDiscoveryShelves(
  creds: XtreamCredentials,
  params: VodDiscoveryShelvesQueryParams,
  signal?: AbortSignal
): Promise<VodDiscoveryShelvesPayload> {
  const res = await fetch(
    `/api/vod/discovery-shelves${buildQueryString(params)}`,
    { headers: catalogHeaders(creds), signal }
  );
  if (!res.ok) {
    throw new Error(`VOD discovery shelves failed: ${res.status}`);
  }
  return res.json() as Promise<VodDiscoveryShelvesPayload>;
}

export function vodDiscoveryShelvesQueryOptions(
  creds: XtreamCredentials,
  params: VodDiscoveryShelvesQueryParams,
  enabled: boolean
): UseQueryOptions<VodDiscoveryShelvesPayload, Error> {
  const recentKey = params.recentIds.join(",");
  const favoriteKey = params.favoriteIds.join(",");

  return {
    queryKey: [
      ...catalogKeys.vodCatalog(creds),
      "discovery-shelves",
      params.hideAdult ? "1" : "0",
      params.parentalUnlocked ? "1" : "0",
      recentKey,
      favoriteKey,
      params.region ?? "US",
    ] as const,
    queryFn: ({ signal }) => fetchVodDiscoveryShelves(creds, params, signal),
    enabled,
    staleTime: 120_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  };
}
