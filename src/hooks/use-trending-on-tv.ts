"use client";

import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import { shouldShowTrendingOnTvShelf } from "@/lib/discovery/live-trending-quality";
import { LIVE_TRENDING_MIN_ITEMS } from "@/lib/discovery/live-trending-on-tv";
import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import {
  listCachedEpgTitlesForAccount,
  whenEpgLocalCacheHydrated,
} from "@/lib/epg-local-cache";
import { useEpgCacheReadiness } from "@/hooks/use-epg-cache-readiness";
import { TRENDING_ON_TV_RESPONSE_TTL_MS } from "@/lib/epg-constants";
import { isLiveTrendingShelfEnabled } from "@/lib/live-epg-policy";
import type { TvRegion } from "@/lib/geo-continent";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";

export type TrendingOnTvApiItem = {
  streamId: number;
  channelName: string;
  programmeTitle: string;
  detail?: string;
  icon?: string;
  directSource?: string;
};

type TrendingOnTvResponse = {
  enabled: boolean;
  tvRegion: TvRegion;
  tmdbCountry: string;
  cached?: boolean;
  items: TrendingOnTvApiItem[];
};

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

function toScoredEntries(items: TrendingOnTvApiItem[]): ScoredLiveEntry[] {
  return items.map((item) => ({
    programmeTitle: item.programmeTitle,
    detail: item.detail,
    score: 0,
    stream: {
      num: item.streamId,
      stream_id: item.streamId,
      name: item.channelName,
      stream_icon: item.icon ?? "",
      stream_type: "live",
      epg_channel_id: "",
      added: "",
      category_id: "",
      custom_sid: "",
      tv_archive: 0,
      direct_source: item.directSource ?? "",
      tv_archive_duration: 0,
    } satisfies LiveStream,
  }));
}

async function fetchTrendingOnTv(
  creds: XtreamCredentials,
  tvRegion: TvRegion,
  priorityStreamIds: number[],
  signal?: AbortSignal
): Promise<TrendingOnTvResponse> {
  await whenEpgLocalCacheHydrated();
  const epgHints = listCachedEpgTitlesForAccount(creds.server, creds.username);
  const origin =
    typeof window !== "undefined" ? window.location.origin : "";
  const url = `${origin}/api/discovery/trending-on-tv`;

  const res = await fetch(url, {
    method: "POST",
    headers: catalogHeaders(creds),
    body: JSON.stringify({
      region: tvRegion,
      priorityIds: priorityStreamIds.slice(0, 12),
      epgHints,
    }),
    signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Trending on TV failed: ${res.status}`);
  }
  return res.json() as Promise<TrendingOnTvResponse>;
}

type UseTrendingOnTvOpts = {
  creds: XtreamCredentials;
  tvRegion: TvRegion;
  recents?: RecentItem[];
  favorites?: Favorite[];
  enabled?: boolean;
};

export function useTrendingOnTv({
  creds,
  tvRegion,
  recents = [],
  favorites = [],
  enabled = true,
}: UseTrendingOnTvOpts) {
  const discoveryOn =
    isDiscoveryShelvesEnabled() && isLiveTrendingShelfEnabled() && enabled;

  const priorityStreamIds = [
    ...recents.filter((r) => r.kind === "live").map((r) => r.id),
    ...favorites.filter((f) => f.kind === "live").map((f) => f.id),
  ];

  const epgCache = useEpgCacheReadiness(
    creds.server,
    creds.username,
    discoveryOn
  );

  const epgCacheBucket = Math.floor(epgCache.count / 8);

  const query = useQuery({
    queryKey: [
      "trending-on-tv",
      creds.server,
      creds.username,
      tvRegion,
      priorityStreamIds.join(","),
      epgCacheBucket,
    ] as const,
    queryFn: ({ signal }) =>
      fetchTrendingOnTv(creds, tvRegion, priorityStreamIds, signal),
    enabled: discoveryOn,
    staleTime: TRENDING_ON_TV_RESPONSE_TTL_MS,
    gcTime: TRENDING_ON_TV_RESPONSE_TTL_MS * 2,
    retry: 2,
    placeholderData: (prev) => prev,
  });

  const rawItems = toScoredEntries(query.data?.items ?? []);
  const items = shouldShowTrendingOnTvShelf(rawItems) ? rawItems : [];

  const loading =
    (query.isLoading && !query.data) ||
    (query.isFetching && items.length === 0 && !query.isError);

  return {
    items,
    tmdbCountry: query.data?.tmdbCountry,
    loading,
    warmingUp: epgCache.warmingUp && items.length === 0 && !query.isError,
    show: discoveryOn,
    hasItems: items.length >= LIVE_TRENDING_MIN_ITEMS,
    isError: query.isError,
  };
}
