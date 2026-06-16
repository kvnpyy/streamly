import { catalogKeys } from "@/lib/catalog-queries";
import type { CatalogSort } from "@/components/CatalogSortToggle";
import {
  VOD_ITEMS_DEFAULT_LIMIT,
  VOD_ITEMS_MAX_LIMIT,
  type VodItemsPage,
} from "@/lib/vod-catalog-items-server";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { VodStream } from "@/lib/xtream-types";
import type { UseQueryOptions } from "@tanstack/react-query";

export { VOD_ITEMS_DEFAULT_LIMIT, VOD_ITEMS_MAX_LIMIT };

export type VodItemsQueryParams = {
  categoryId: string | "all";
  offset?: number;
  limit?: number;
  sort?: CatalogSort;
  q?: string;
  lang?: string;
  streamIds?: number[];
};

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

export async function fetchVodItemsPage(
  creds: XtreamCredentials,
  params: VodItemsQueryParams,
  signal?: AbortSignal
): Promise<VodItemsPage> {
  const url = new URL(
    `${typeof window !== "undefined" ? window.location.origin : ""}/api/vod/items`
  );
  url.searchParams.set(
    "categoryId",
    params.categoryId === "all" ? "all" : String(params.categoryId)
  );
  const limit = Math.min(
    VOD_ITEMS_MAX_LIMIT,
    Math.max(1, params.limit ?? VOD_ITEMS_DEFAULT_LIMIT)
  );
  url.searchParams.set("limit", String(limit));
  if (params.offset) url.searchParams.set("offset", String(params.offset));
  if (params.sort && params.sort !== "added") {
    url.searchParams.set("sort", params.sort);
  }
  const q = params.q?.trim();
  if (q) url.searchParams.set("q", q);
  const lang = params.lang?.trim();
  if (lang) url.searchParams.set("lang", lang);
  if (params.streamIds?.length) {
    url.searchParams.set("ids", params.streamIds.slice(0, 48).join(","));
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: catalogHeaders(creds),
    signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Could not load movies (${res.status}).`);
  }
  const data = (await res.json()) as VodItemsPage;
  return {
    items: Array.isArray(data.items) ? data.items : [],
    total: Number.isFinite(data.total) ? data.total : 0,
    offset: Number.isFinite(data.offset) ? data.offset : 0,
    limit: Number.isFinite(data.limit) ? data.limit : limit,
  };
}

export function vodItemsQueryOptions(
  creds: XtreamCredentials,
  params: VodItemsQueryParams,
  enabled: boolean
): UseQueryOptions<VodItemsPage, Error> {
  const q = params.q?.trim() ?? "";
  const sort = params.sort ?? "added";
  const categoryId = params.categoryId;
  const offset = params.offset ?? 0;
  const limit = params.limit ?? VOD_ITEMS_MAX_LIMIT;
  const idsKey = params.streamIds?.join(",") ?? "";
  const lang = params.lang?.trim() ?? "";

  return {
    queryKey: [
      ...catalogKeys.vodCatalog(creds),
      "items",
      categoryId,
      offset,
      limit,
      sort,
      q,
      lang,
      idsKey,
    ] as const,
    queryFn: ({ signal }) => fetchVodItemsPage(creds, params, signal),
    enabled,
    staleTime: 60_000,
    gcTime: 120_000,
    structuralSharing: false,
    refetchOnWindowFocus: false,
  };
}

export type { VodStream };
