import { catalogKeys, CATALOG_STALE_MS } from "@/lib/catalog-queries";
import type { SeriesCatalogBundle } from "@/lib/vod-catalog-bundle";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { xtream } from "@/lib/xtream";
import type { UseQueryOptions } from "@tanstack/react-query";

export function seriesCatalogQueryOptions(
  creds: XtreamCredentials,
  enabled = true
): UseQueryOptions<SeriesCatalogBundle, Error> {
  return {
    queryKey: catalogKeys.seriesCatalog(creds),
    queryFn: ({ signal }) => xtream.seriesCatalogBundle(creds, signal),
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_STALE_MS * 2,
    structuralSharing: false,
    refetchOnWindowFocus: false,
    enabled,
  };
}
