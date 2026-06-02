import { catalogKeys, CATALOG_STALE_MS } from "@/lib/catalog-queries";
import { toSlimLiveCatalog, type SlimLiveCatalog } from "@/lib/slim-live-catalog";
import { xtream } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { UseQueryOptions } from "@tanstack/react-query";
import type { LiveCatalogBundle } from "@/lib/xtream";

async function fetchSlimLiveCatalog(
  creds: XtreamCredentials,
  signal?: AbortSignal
): Promise<SlimLiveCatalog> {
  const headers: Record<string, string> = {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
    "x-live-catalog-slim": "1",
  };
  const res = await fetch("/api/live/catalog", {
    method: "GET",
    headers,
    signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Live catalogue failed (${res.status}).`);
  }
  const text = await res.text();
  const { parseCatalogJson } = await import("@/lib/parse-catalog-json");
  const data = (await parseCatalogJson(text)) as LiveCatalogBundle;
  return toSlimLiveCatalog(data);
}

/**
 * React Query options for the merged live catalog.
 * `structuralSharing: false` avoids deep-equality walks on 10k+ stream arrays (major jank).
 */
export function liveCatalogQueryOptions(
  creds: XtreamCredentials
): UseQueryOptions<LiveCatalogBundle, Error> {
  return {
    queryKey: catalogKeys.live(creds),
    queryFn: ({ signal }) => xtream.liveCatalogBundle(creds, signal),
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_STALE_MS * 2,
    structuralSharing: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 2,
  };
}

/** Live TV browse — categories + index only; channel rows load per category. */
export function slimLiveCatalogQueryOptions(
  creds: XtreamCredentials
): UseQueryOptions<SlimLiveCatalog, Error> {
  return {
    queryKey: [...catalogKeys.live(creds), "slim"] as const,
    queryFn: ({ signal }) => fetchSlimLiveCatalog(creds, signal),
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_STALE_MS * 2,
    structuralSharing: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    retry: 2,
  };
}
