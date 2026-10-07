"use client";

import { catalogKeys } from "@/lib/catalog-queries";
import type { TvRegion } from "@/lib/geo-continent";
import { MIN_SEARCH_QUERY_LEN } from "@/lib/search-normalize";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export type OnAirSearchMatch = {
  stream: LiveStream;
  title: string;
  slot: "now" | "upcoming";
  start: number;
  end: number;
};

export type OnAirSearchResult = {
  matches: OnAirSearchMatch[];
};

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

export async function fetchOnAirSearch(
  creds: XtreamCredentials,
  opts: {
    q: string;
    categoryId?: string | "all";
    tvRegion?: TvRegion;
    hideAdult?: boolean;
    signal?: AbortSignal;
  }
): Promise<OnAirSearchResult> {
  const url = new URL(
    `${typeof window !== "undefined" ? window.location.origin : ""}/api/live/catalog/on-air`
  );
  url.searchParams.set("q", opts.q.trim());
  url.searchParams.set(
    "categoryId",
    opts.categoryId === "all" || !opts.categoryId ? "all" : String(opts.categoryId)
  );
  if (opts.tvRegion && opts.tvRegion !== "All") {
    url.searchParams.set("region", opts.tvRegion);
  }
  if (opts.hideAdult) url.searchParams.set("safe", "1");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: catalogHeaders(creds),
    signal: opts.signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Could not search the TV guide (${res.status}).`);
  }
  const data = (await res.json()) as OnAirSearchResult;
  return {
    matches: Array.isArray(data.matches) ? data.matches : [],
  };
}

export function useOnAirSearch(
  creds: XtreamCredentials | null,
  q: string,
  categoryId: string | "all",
  tvRegion: TvRegion | undefined,
  hideAdult: boolean
): UseQueryResult<OnAirSearchResult, Error> {
  const needle = q.trim().toLowerCase();
  const regionKey = tvRegion && tvRegion !== "All" ? tvRegion : "";
  return useQuery({
    queryKey: [
      ...(creds ? catalogKeys.live(creds) : ["live-catalog", "", ""]),
      "on-air",
      categoryId,
      regionKey,
      needle,
      hideAdult ? "safe" : "open",
    ],
    queryFn: ({ signal }) =>
      fetchOnAirSearch(creds!, {
        q: needle,
        categoryId,
        tvRegion,
        hideAdult,
        signal,
      }),
    enabled: Boolean(creds) && needle.length >= MIN_SEARCH_QUERY_LEN,
    staleTime: 60_000,
    gcTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });
}
