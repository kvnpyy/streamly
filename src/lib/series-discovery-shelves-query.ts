import { catalogKeys } from "@/lib/catalog-queries";
import type { SeriesDiscoveryShelvesPayload } from "@/lib/vod-discovery-shelves-types";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { UseQueryOptions } from "@tanstack/react-query";

export type SeriesDiscoveryShelvesQueryParams = {
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

function buildQueryString(params: SeriesDiscoveryShelvesQueryParams): string {
  const qs = new URLSearchParams();
  if (params.hideAdult) qs.set("hideAdult", "1");
  if (params.parentalUnlocked) qs.set("parentalUnlocked", "1");
  if (params.recentIds.length) qs.set("recentIds", params.recentIds.join(","));
  if (params.favoriteIds.length) qs.set("favoriteIds", params.favoriteIds.join(","));
  if (params.region) qs.set("region", params.region);
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export async function fetchSeriesDiscoveryShelves(
  creds: XtreamCredentials,
  params: SeriesDiscoveryShelvesQueryParams,
  signal?: AbortSignal
): Promise<SeriesDiscoveryShelvesPayload> {
  const res = await fetch(
    `/api/series/discovery-shelves${buildQueryString(params)}`,
    { headers: catalogHeaders(creds), signal }
  );
  if (!res.ok) {
    throw new Error(`Series discovery shelves failed: ${res.status}`);
  }
  return res.json() as Promise<SeriesDiscoveryShelvesPayload>;
}

export function seriesDiscoveryShelvesQueryOptions(
  creds: XtreamCredentials,
  params: SeriesDiscoveryShelvesQueryParams,
  enabled: boolean
): UseQueryOptions<SeriesDiscoveryShelvesPayload, Error> {
  const recentKey = params.recentIds.join(",");
  const favoriteKey = params.favoriteIds.join(",");

  return {
    queryKey: [
      ...catalogKeys.seriesCatalog(creds),
      "discovery-shelves",
      params.hideAdult ? "1" : "0",
      params.parentalUnlocked ? "1" : "0",
      recentKey,
      favoriteKey,
      params.region ?? "US",
    ] as const,
    queryFn: ({ signal }) => fetchSeriesDiscoveryShelves(creds, params, signal),
    enabled,
    staleTime: 120_000,
    gcTime: 300_000,
    refetchOnWindowFocus: false,
  };
}
