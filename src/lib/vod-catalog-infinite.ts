import { catalogKeys } from "@/lib/catalog-queries";
import type { CatalogSort } from "@/components/CatalogSortToggle";
import {
  VOD_ITEMS_DEFAULT_LIMIT,
  type SeriesItemsPage,
  type VodItemsPage,
} from "@/lib/vod-catalog-items-server";
import {
  fetchSeriesItemsPage,
  type SeriesItemsQueryParams,
} from "@/lib/series-catalog-items";
import {
  fetchVodItemsPage,
  type VodItemsQueryParams,
} from "@/lib/vod-catalog-items";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { InfiniteData } from "@tanstack/react-query";

/** First paint + each "show more" batch for Movies/Series grids. */
export const VOD_GRID_PAGE_SIZE = VOD_ITEMS_DEFAULT_LIMIT;

export type CatalogGridBaseParams = {
  categoryId: string | "all";
  sort?: CatalogSort;
  q?: string;
  lang?: string;
};

export type CatalogItemsPage = {
  items: unknown[];
  total: number;
  offset: number;
  limit: number;
};

export function catalogItemsNextPageParam(
  lastPage: CatalogItemsPage
): number | undefined {
  const next = lastPage.offset + lastPage.items.length;
  return next < lastPage.total ? next : undefined;
}

/** @deprecated Use catalogItemsNextPageParam */
export function vodItemsNextPageParam(lastPage: VodItemsPage): number | undefined {
  return catalogItemsNextPageParam(lastPage);
}

export function flattenCatalogPages<T>(
  data: InfiniteData<{ items: T[] }> | undefined
): T[] {
  if (!data?.pages.length) return [];
  return data.pages.flatMap((p) => p.items);
}

export function flattenVodItemsPages(
  data: InfiniteData<VodItemsPage> | undefined
): VodItemsPage["items"] {
  return flattenCatalogPages(data);
}

export function catalogGridTotal(
  data: InfiniteData<CatalogItemsPage> | undefined
): number {
  return data?.pages[0]?.total ?? 0;
}

export function vodCatalogGridInfiniteKey(
  creds: XtreamCredentials,
  params: CatalogGridBaseParams
) {
  const q = params.q?.trim() ?? "";
  const sort = params.sort ?? "added";
  const lang = params.lang?.trim() ?? "";
  return [
    ...catalogKeys.vodCatalog(creds),
    "items-infinite",
    params.categoryId,
    sort,
    q,
    lang,
    VOD_GRID_PAGE_SIZE,
  ] as const;
}

export function seriesCatalogGridInfiniteKey(
  creds: XtreamCredentials,
  params: CatalogGridBaseParams
) {
  const q = params.q?.trim() ?? "";
  const sort = params.sort ?? "added";
  const lang = params.lang?.trim() ?? "";
  return [
    ...catalogKeys.seriesCatalog(creds),
    "items-infinite",
    params.categoryId,
    sort,
    q,
    lang,
    VOD_GRID_PAGE_SIZE,
  ] as const;
}

export async function fetchVodCatalogGridPage(
  creds: XtreamCredentials,
  params: CatalogGridBaseParams,
  offset: number,
  signal?: AbortSignal
): Promise<VodItemsPage> {
  const pageParams: VodItemsQueryParams = {
    categoryId: params.categoryId,
    sort: params.sort,
    q: params.q,
    lang: params.lang,
    offset,
    limit: VOD_GRID_PAGE_SIZE,
  };
  return fetchVodItemsPage(creds, pageParams, signal);
}

export async function fetchSeriesCatalogGridPage(
  creds: XtreamCredentials,
  params: CatalogGridBaseParams,
  offset: number,
  signal?: AbortSignal
): Promise<SeriesItemsPage> {
  const pageParams: SeriesItemsQueryParams = {
    categoryId: params.categoryId,
    sort: params.sort,
    q: params.q,
    lang: params.lang,
    offset,
    limit: VOD_GRID_PAGE_SIZE,
  };
  return fetchSeriesItemsPage(creds, pageParams, signal);
}
