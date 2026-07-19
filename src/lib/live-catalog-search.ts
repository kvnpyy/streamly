import { catalogKeys } from "@/lib/catalog-queries";
import type { TvRegion } from "@/lib/geo-continent";
import type {
  LiveCatalogSearchResult,
} from "@/lib/live-catalog-search-server";
import { MIN_SEARCH_QUERY_LEN } from "@/lib/search-normalize";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { UseQueryOptions } from "@tanstack/react-query";

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

export async function fetchLiveChannelSearch(
  creds: XtreamCredentials,
  opts: {
    q: string;
    categoryId?: string | "all";
    tvRegion?: TvRegion;
    signal?: AbortSignal;
  }
): Promise<LiveCatalogSearchResult> {
  const needle = opts.q.trim();
  const url = new URL(
    `${typeof window !== "undefined" ? window.location.origin : ""}/api/live/catalog/search`
  );
  url.searchParams.set("q", needle);
  url.searchParams.set(
    "categoryId",
    opts.categoryId === "all" || !opts.categoryId
      ? "all"
      : String(opts.categoryId)
  );
  if (opts.tvRegion && opts.tvRegion !== "All") {
    url.searchParams.set("region", opts.tvRegion);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: catalogHeaders(creds),
    signal: opts.signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Could not search live channels (${res.status}).`);
  }
  const data = (await res.json()) as LiveCatalogSearchResult;
  return {
    matches: Array.isArray(data.matches) ? data.matches : [],
    scanPool: Array.isArray(data.scanPool) ? data.scanPool : [],
    totalInScope: Number.isFinite(data.totalInScope) ? data.totalInScope : 0,
  };
}

export function liveChannelSearchQueryOptions(
  creds: XtreamCredentials,
  q: string,
  categoryId: string | "all",
  tvRegion: TvRegion | undefined,
  enabled: boolean
): UseQueryOptions<LiveCatalogSearchResult, Error> {
  const needle = q.trim().toLowerCase();
  const regionKey = tvRegion && tvRegion !== "All" ? tvRegion : "";
  return {
    queryKey: [
      ...catalogKeys.live(creds),
      "search",
      categoryId,
      regionKey,
      needle,
    ] as const,
    queryFn: ({ signal }) =>
      fetchLiveChannelSearch(creds, {
        q: needle,
        categoryId,
        tvRegion,
        signal,
      }),
    enabled: enabled && needle.length >= MIN_SEARCH_QUERY_LEN,
    staleTime: 45_000,
    gcTime: 120_000,
    structuralSharing: false,
    refetchOnWindowFocus: false,
  };
}
