"use client";

import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import { LIVE_TRENDING_MIN_ITEMS } from "@/lib/discovery/live-trending-on-tv";
import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import {
  listCachedEpgTitlesForAccount,
  whenEpgLocalCacheHydrated,
} from "@/lib/epg-local-cache";
import { useEpgCacheReadiness } from "@/hooks/use-epg-cache-readiness";
import {
  TRENDING_ON_TV_RESPONSE_TTL_MS,
  TRENDING_ON_TV_SHELF_HINT_WAIT_MS,
} from "@/lib/epg-constants";
import { isLiveTrendingShelfEnabled } from "@/lib/live-epg-policy";
import type { TvRegion } from "@/lib/geo-continent";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import { useLiveBrowseUi, type ShelfEpgHint } from "@/store/live-browse-ui";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

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
  _debug?: Record<string, unknown>;
};

/** Do not show another region's shelf while a new region query loads. */
export function trendingOnTvPlaceholderData(
  previousData: TrendingOnTvResponse | undefined,
  previousQueryKey: readonly unknown[] | undefined,
  tvRegion: TvRegion
): TrendingOnTvResponse | undefined {
  const prevRegion = previousQueryKey?.[3];
  return prevRegion === tvRegion ? previousData : undefined;
}

/**
 * Local EPG / shelf hints are soft boosts for the POST body — never part of the
 * React Query key (that caused refetch storms as IndexedDB filled).
 */
export function trendingOnTvQueryKey(
  server: string,
  username: string,
  tvRegion: TvRegion,
  priorityStreamIds: number[]
): readonly [
  "trending-on-tv",
  string,
  string,
  TvRegion,
  string,
] {
  return [
    "trending-on-tv",
    server,
    username,
    tvRegion,
    priorityStreamIds.slice(0, 8).join(","),
  ] as const;
}

/** Skip the cold hint wait when IndexedDB or shelf rows already have titles. */
export function shouldSkipTrendingShelfHintWait(opts: {
  localEpgTitleCount: number;
  shelfHintCount: number;
  minTitles?: number;
}): boolean {
  const min = opts.minTitles ?? LIVE_TRENDING_MIN_ITEMS;
  return opts.localEpgTitleCount >= min || opts.shelfHintCount >= min;
}

function mergeEpgHints(
  ...groups: Array<Array<{ streamId: number; title: string }>>
): ShelfEpgHint[] {
  const byId = new Map<number, string>();
  for (const group of groups) {
    for (const { streamId, title } of group) {
      const t = title?.trim();
      if (!t || !Number.isFinite(streamId) || streamId <= 0) continue;
      byId.set(streamId, t);
    }
  }
  return [...byId.entries()].map(([streamId, title]) => ({ streamId, title }));
}

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
  shelfHints: ShelfEpgHint[],
  signal?: AbortSignal
): Promise<TrendingOnTvResponse> {
  await whenEpgLocalCacheHydrated();
  const epgHints = mergeEpgHints(
    listCachedEpgTitlesForAccount(creds.server, creds.username),
    shelfHints
  );
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

  const priorityStreamIds = useMemo(
    () => [
      ...recents.filter((r) => r.kind === "live").map((r) => r.id),
      ...favorites.filter((f) => f.kind === "live").map((f) => f.id),
    ],
    [recents, favorites]
  );

  const shelfEpgHints = useLiveBrowseUi((s) => s.shelfEpgHints);

  const epgCache = useEpgCacheReadiness(
    creds.server,
    creds.username,
    discoveryOn
  );

  /** Wait briefly for shelf rows only when local EPG is still empty. */
  const [shelfWaitDone, setShelfWaitDone] = useState(false);
  const prevRegionRef = useRef(tvRegion);
  useEffect(() => {
    if (prevRegionRef.current !== tvRegion) {
      prevRegionRef.current = tvRegion;
      setShelfWaitDone(false);
    }
    if (
      shouldSkipTrendingShelfHintWait({
        localEpgTitleCount: epgCache.count,
        shelfHintCount: shelfEpgHints.length,
      })
    ) {
      queueMicrotask(() => setShelfWaitDone(true));
      return;
    }
    const t = setTimeout(
      () => setShelfWaitDone(true),
      TRENDING_ON_TV_SHELF_HINT_WAIT_MS
    );
    return () => clearTimeout(t);
  }, [tvRegion, shelfEpgHints.length, epgCache.count]);

  const queryKey = useMemo(
    () =>
      trendingOnTvQueryKey(
        creds.server,
        creds.username,
        tvRegion,
        priorityStreamIds
      ),
    [creds.server, creds.username, tvRegion, priorityStreamIds]
  );

  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) =>
      fetchTrendingOnTv(
        creds,
        tvRegion,
        priorityStreamIds,
        shelfEpgHints,
        signal
      ),
    enabled: discoveryOn && shelfWaitDone,
    staleTime: TRENDING_ON_TV_RESPONSE_TTL_MS,
    gcTime: TRENDING_ON_TV_RESPONSE_TTL_MS * 2,
    retry: 2,
    placeholderData: (prev, prevQuery) =>
      trendingOnTvPlaceholderData(prev, prevQuery?.queryKey, tvRegion),
  });

  const regionMismatch =
    query.data != null && query.data.tvRegion !== tvRegion;
  const items = regionMismatch
    ? []
    : toScoredEntries(query.data?.items ?? []);

  if (
    process.env.NODE_ENV === "development" &&
    query.data?._debug &&
    typeof console !== "undefined"
  ) {
    console.debug("[trending-on-tv]", query.data._debug);
  }

  const loading =
    !shelfWaitDone ||
    regionMismatch ||
    (query.isLoading && !query.data) ||
    (query.isFetching && items.length === 0 && !query.isError);

  return {
    items,
    tmdbCountry: query.data?.tmdbCountry,
    loading,
    /**
     * Server builds the shelf; local EPG warmup must not keep the skeleton up
     * for 6s after a fast cached response.
     */
    warmingUp: false,
    show: discoveryOn,
    hasItems: items.length >= LIVE_TRENDING_MIN_ITEMS,
    isError: query.isError,
  };
}
