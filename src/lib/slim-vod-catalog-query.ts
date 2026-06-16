import { catalogKeys, CATALOG_STALE_MS } from "@/lib/catalog-queries";
import { parseSlimCatalogResponse, type SlimVodCatalog } from "@/lib/slim-vod-catalog";
import type { VodCatalogBundle } from "@/lib/vod-catalog-bundle";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { UseQueryOptions } from "@tanstack/react-query";

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

async function fetchSlimVodCatalog(
  creds: XtreamCredentials,
  signal?: AbortSignal
): Promise<SlimVodCatalog> {
  const res = await fetch("/api/vod/catalog?slim=1", {
    method: "GET",
    headers: { ...catalogHeaders(creds), "x-vod-catalog-slim": "1" },
    signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Movie catalog failed (${res.status}).`);
  }
  const data = (await res.json()) as VodCatalogBundle & SlimVodCatalog;
  return parseSlimCatalogResponse(data);
}

/** Categories + counts only — movie rows load per page from `/api/vod/items`. */
export function slimVodCatalogQueryOptions(
  creds: XtreamCredentials,
  enabled = true
): UseQueryOptions<SlimVodCatalog, Error> {
  return {
    queryKey: [...catalogKeys.vodCatalog(creds), "slim"] as const,
    queryFn: ({ signal }) => fetchSlimVodCatalog(creds, signal),
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_STALE_MS * 2,
    structuralSharing: false,
    refetchOnWindowFocus: false,
    enabled,
  };
}
