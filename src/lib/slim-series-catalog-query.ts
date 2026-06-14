import { catalogKeys, CATALOG_STALE_MS } from "@/lib/catalog-queries";
import { toSlimSeriesCatalog, type SlimSeriesCatalog } from "@/lib/slim-vod-catalog";
import type { SeriesCatalogBundle } from "@/lib/vod-catalog-bundle";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { UseQueryOptions } from "@tanstack/react-query";

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

async function fetchSlimSeriesCatalog(
  creds: XtreamCredentials,
  signal?: AbortSignal
): Promise<SlimSeriesCatalog> {
  const res = await fetch("/api/series/catalog?slim=1", {
    method: "GET",
    headers: { ...catalogHeaders(creds), "x-series-catalog-slim": "1" },
    signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Series catalog failed (${res.status}).`);
  }
  const data = (await res.json()) as SeriesCatalogBundle;
  return toSlimSeriesCatalog(data);
}

/** Categories + counts only — series rows load per page from `/api/series/items`. */
export function slimSeriesCatalogQueryOptions(
  creds: XtreamCredentials,
  enabled = true
): UseQueryOptions<SlimSeriesCatalog, Error> {
  return {
    queryKey: [...catalogKeys.seriesCatalog(creds), "slim"] as const,
    queryFn: ({ signal }) => fetchSlimSeriesCatalog(creds, signal),
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_STALE_MS * 2,
    structuralSharing: false,
    refetchOnWindowFocus: false,
    enabled,
  };
}
