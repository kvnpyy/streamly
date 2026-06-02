import { catalogKeys, CATALOG_STALE_MS } from "@/lib/catalog-queries";
import type { VodCatalogBundle } from "@/lib/vod-catalog-bundle";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { xtream } from "@/lib/xtream";
import type { UseQueryOptions } from "@tanstack/react-query";

export function vodCatalogQueryOptions(
  creds: XtreamCredentials,
  enabled = true
): UseQueryOptions<VodCatalogBundle, Error> {
  return {
    queryKey: catalogKeys.vodCatalog(creds),
    queryFn: ({ signal }) => xtream.vodCatalogBundle(creds, signal),
    staleTime: CATALOG_STALE_MS,
    gcTime: CATALOG_STALE_MS * 2,
    structuralSharing: false,
    refetchOnWindowFocus: false,
    enabled,
  };
}
