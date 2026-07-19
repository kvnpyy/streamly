import { catalogKeys } from "@/lib/catalog-queries";
import { MIN_SEARCH_QUERY_LEN } from "@/lib/search-normalize";
import { fetchSeriesItemsPage } from "@/lib/series-catalog-items";
import { fetchVodItemsPage } from "@/lib/vod-catalog-items";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { UseQueryOptions } from "@tanstack/react-query";

const SEARCH_ITEMS_LIMIT = 48;

export function vodCatalogSearchQueryOptions(
  creds: XtreamCredentials,
  q: string,
  enabled: boolean
): UseQueryOptions<
  Awaited<ReturnType<typeof fetchVodItemsPage>>,
  Error
> {
  const needle = q.trim();
  return {
    queryKey: [...catalogKeys.vodCatalog(creds), "search", needle] as const,
    queryFn: ({ signal }) =>
      fetchVodItemsPage(
        creds,
        { categoryId: "all", q: needle, limit: SEARCH_ITEMS_LIMIT },
        signal
      ),
    enabled: enabled && needle.length >= MIN_SEARCH_QUERY_LEN,
    staleTime: 60_000,
    gcTime: 120_000,
    structuralSharing: false,
    refetchOnWindowFocus: false,
  };
}

export function seriesCatalogSearchQueryOptions(
  creds: XtreamCredentials,
  q: string,
  enabled: boolean
): UseQueryOptions<
  Awaited<ReturnType<typeof fetchSeriesItemsPage>>,
  Error
> {
  const needle = q.trim();
  return {
    queryKey: [...catalogKeys.seriesCatalog(creds), "search", needle] as const,
    queryFn: ({ signal }) =>
      fetchSeriesItemsPage(
        creds,
        { categoryId: "all", q: needle, limit: SEARCH_ITEMS_LIMIT },
        signal
      ),
    enabled: enabled && needle.length >= MIN_SEARCH_QUERY_LEN,
    staleTime: 60_000,
    gcTime: 120_000,
    structuralSharing: false,
    refetchOnWindowFocus: false,
  };
}

export function vodCategoryPreviewQueryOptions(
  creds: XtreamCredentials,
  categoryId: string | undefined,
  enabled: boolean,
  limit = 200
): UseQueryOptions<Awaited<ReturnType<typeof fetchVodItemsPage>>, Error> {
  const cid = categoryId?.trim() ?? "";
  return {
    queryKey: [
      ...catalogKeys.vodCatalog(creds),
      "category-preview",
      cid,
      limit,
    ] as const,
    queryFn: ({ signal }) =>
      fetchVodItemsPage(
        creds,
        { categoryId: cid, limit, offset: 0 },
        signal
      ),
    enabled: enabled && cid.length > 0,
    staleTime: 120_000,
    gcTime: 300_000,
    structuralSharing: false,
    refetchOnWindowFocus: false,
  };
}

export function seriesCategoryPreviewQueryOptions(
  creds: XtreamCredentials,
  categoryId: string | undefined,
  enabled: boolean,
  limit = 200
): UseQueryOptions<Awaited<ReturnType<typeof fetchSeriesItemsPage>>, Error> {
  const cid = categoryId?.trim() ?? "";
  return {
    queryKey: [
      ...catalogKeys.seriesCatalog(creds),
      "category-preview",
      cid,
      limit,
    ] as const,
    queryFn: ({ signal }) =>
      fetchSeriesItemsPage(
        creds,
        { categoryId: cid, limit, offset: 0 },
        signal
      ),
    enabled: enabled && cid.length > 0,
    staleTime: 120_000,
    gcTime: 300_000,
    structuralSharing: false,
    refetchOnWindowFocus: false,
  };
}
