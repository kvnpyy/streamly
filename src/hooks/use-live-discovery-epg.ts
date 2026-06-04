"use client";

import {
  buildLiveTrendingOnTv,
  LIVE_TRENDING_ON_TV_MAX_SCAN,
} from "@/lib/discovery/live-trending-on-tv";
import {
  LIVE_DISCOVERY_EPG_CONCURRENCY,
  LIVE_DISCOVERY_MAX_SCAN,
  LIVE_DISCOVERY_MIN_ITEMS,
  formatTonightDetail,
  scoreOnNowEntry,
  scoreTonightEntry,
  type ScoredLiveEntry,
} from "@/lib/discovery/live-scoring";
import type { TmdbTrendingItem } from "@/lib/discovery/types";
import { filterScoredLiveEntries } from "@/lib/discovery/live-quality";
import { pickLiveDiscoveryCandidateIds } from "@/lib/discovery/live-candidates";
import {
  snapshotFromListings,
  type StreamEpgSnapshot,
} from "@/lib/discovery/live-epg";
import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import {
  buildSportsOnGuideEntries,
  matchEventsToChannels,
} from "@/lib/discovery/sports-match";
import {
  eventMatchesToScoredEntries,
  SPORTS_SHELF_MIN_ITEMS,
  sportsGuideToScoredEntries,
} from "@/lib/discovery/sports-scoring";
import { useDiscoverySports } from "@/hooks/use-discovery-sports";
import { yieldToMain } from "@/lib/yield-to-main";
import { prefetchArtworkTitles } from "@/lib/tmdb-artwork-prefetch";
import {
  tvDiscoveryEpgConcurrency,
  tvDiscoveryEpgMaxScan,
  tvDiscoveryFastScanCount,
  tvHomeDiscoveryDeferMs,
  tvLiveDiscoveryMinItems,
  tvSportsShelfMinItems,
} from "@/lib/tv-playback-tune";
import { isTvClassUserAgent } from "@/lib/tv-user-agent";
import { SHORT_EPG_NOW_PLAYING_LIMIT } from "@/lib/epg-constants";
import {
  isLiveDiscoveryEpgNetworkEnabled,
  isLiveTrendingShelfEnabled,
  LIVE_DISCOVERY_NETWORK_CAP,
} from "@/lib/live-epg-policy";
import { shouldShowTrendingOnTvShelf } from "@/lib/discovery/live-trending-quality";
import {
  getBulkCachedEpgTitles,
  setCachedEpgTitlesBatch,
} from "@/lib/epg-local-cache";
import { SHORT_EPG_STALE_MS } from "@/lib/hooks";
import { xtream } from "@/lib/xtream";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

type UseLiveDiscoveryEpgOpts = {
  channels: LiveStream[];
  creds: XtreamCredentials;
  recents: RecentItem[];
  favorites: Favorite[];
  enabled?: boolean;
  /** Override scan cap (defaults to TV-aware limit). */
  maxScan?: number;
  /** Delay first EPG batch (TV home defers to let UI paint). */
  deferMs?: number;
  /** Samsung / Fire TV / Silk — lower shelf minimums, partial rows while scanning. */
  livingRoom?: boolean;
  /** Scan these stream IDs before the rest (e.g. trending shelf channels). */
  priorityStreamIds?: number[];
  /** TMDB weekly trending (movies + series) for "Trending on TV" ranking. */
  tmdbTrending?: TmdbTrendingItem[];
};

function seedSnapshotsFromCache(
  creds: XtreamCredentials,
  candidateIds: number[]
): Map<number, StreamEpgSnapshot> {
  const bulk = getBulkCachedEpgTitles(
    creds.server,
    creds.username,
    candidateIds
  );
  const seed = new Map<number, StreamEpgSnapshot>();
  for (const [id, title] of bulk) {
    seed.set(id, { nowTitle: title });
  }
  return seed;
}

export function useLiveDiscoveryEpg({
  channels,
  creds,
  recents,
  favorites,
  enabled = true,
  maxScan: maxScanOverride,
  deferMs: deferMsOverride,
  livingRoom = false,
  priorityStreamIds = [],
  tmdbTrending = [],
}: UseLiveDiscoveryEpgOpts) {
  const queryClient = useQueryClient();
  const discoveryOn = isDiscoveryShelvesEnabled();
  const ua =
    typeof navigator !== "undefined" ? navigator.userAgent || "" : "";
  const maxScan =
    maxScanOverride ??
    (isTvClassUserAgent(ua) ? tvDiscoveryEpgMaxScan(ua) : LIVE_DISCOVERY_MAX_SCAN);
  const deferMs = deferMsOverride ?? tvHomeDiscoveryDeferMs(ua);
  const active = enabled && discoveryOn && channels.length > 0;

  const candidateIds = useMemo(
    () =>
      active
        ? pickLiveDiscoveryCandidateIds(
            channels,
            recents,
            favorites,
            maxScan,
            priorityStreamIds
          )
        : [],
    [active, channels, recents, favorites, maxScan, priorityStreamIds]
  );

  const epgConcurrency = livingRoom
    ? tvDiscoveryEpgConcurrency(ua)
    : LIVE_DISCOVERY_EPG_CONCURRENCY;

  const fastScanCount = livingRoom
    ? tvDiscoveryFastScanCount(ua)
    : Math.min(32, maxScan);

  const [snapshots, setSnapshots] = useState<Map<number, StreamEpgSnapshot>>(
    () => new Map()
  );
  const [loading, setLoading] = useState(false);
  const [examined, setExamined] = useState(0);

  const recentIds = useMemo(
    () => new Set(recents.filter((r) => r.kind === "live").map((r) => r.id)),
    [recents]
  );
  const favIds = useMemo(
    () => new Set(favorites.filter((f) => f.kind === "live").map((f) => f.id)),
    [favorites]
  );

  const channelById = useMemo(
    () => new Map(channels.map((c) => [c.stream_id, c])),
    [channels]
  );

  useEffect(() => {
    if (!active || candidateIds.length === 0) {
      queueMicrotask(() => {
        setSnapshots(new Map());
        setLoading(false);
        setExamined(0);
      });
      return;
    }

    let cancelled = false;
    let deferTimer: ReturnType<typeof setTimeout> | null = null;
    const seed = seedSnapshotsFromCache(creds, candidateIds);
    const seedOnNowCount = [...seed.values()].filter((s) =>
      Boolean(s.nowTitle?.trim())
    ).length;
    const hasWarmCache = seedOnNowCount > 0;
    const effectiveDefer = hasWarmCache ? 0 : deferMs;

    queueMicrotask(() => {
      setSnapshots(new Map(seed));
      setLoading(!hasWarmCache);
      setExamined(0);
    });

    const networkOn = isLiveDiscoveryEpgNetworkEnabled();
    const networkCap = LIVE_DISCOVERY_NETWORK_CAP;
    const priorityOnly = priorityStreamIds.slice(0, networkCap);
    const scanIds = networkOn
      ? [
          ...new Set([
            ...priorityOnly,
            ...candidateIds.slice(0, fastScanCount),
          ]),
        ].slice(0, Math.min(fastScanCount, networkCap))
      : [];
    const bulkCached = getBulkCachedEpgTitles(
      creds.server,
      creds.username,
      candidateIds
    );
    const pendingIds = scanIds.filter((id) => !bulkCached.has(id));

    const runScan = async () => {
      if (!networkOn || pendingIds.length === 0) {
        if (!cancelled) {
          setExamined(candidateIds.length);
          setSnapshots(new Map(seed));
          setLoading(false);
        }
        return;
      }
      const merged = new Map(seed);
      const nowSec = Math.floor(Date.now() / 1000);
      let examinedSoFar = scanIds.length - pendingIds.length;
      let batchesDone = 0;
      const cacheBatch: Array<{ streamId: number; title: string }> = [];

      for (let i = 0; i < pendingIds.length; i += epgConcurrency) {
        if (cancelled) break;
        const slice = pendingIds.slice(i, i + epgConcurrency);

        await Promise.all(
          slice.map(async (streamId) => {
            try {
              const data = await queryClient.fetchQuery({
                queryKey: [
                  "short-epg",
                  creds.server,
                  creds.username,
                  streamId,
                  SHORT_EPG_NOW_PLAYING_LIMIT,
                ],
                queryFn: ({ signal }) =>
                  xtream.shortEPG(
                    creds,
                    streamId,
                    SHORT_EPG_NOW_PLAYING_LIMIT,
                    signal
                  ),
                staleTime: SHORT_EPG_STALE_MS,
                retry: false,
              });
              if (cancelled) return;
              const listings = data?.epg_listings;
              if (!listings?.length) return;
              const snap = snapshotFromListings(listings, nowSec);
              merged.set(streamId, snap);
              if (snap.nowTitle) {
                cacheBatch.push({ streamId, title: snap.nowTitle });
              }
            } catch {
              /* skip failed channel */
            }
          })
        );

        if (cancelled) break;
        examinedSoFar = Math.min(
          examinedSoFar + slice.length,
          scanIds.length
        );
        batchesDone += 1;
        const flushUi =
          batchesDone % 3 === 0 ||
          i + epgConcurrency >= pendingIds.length;
        if (flushUi) {
          setExamined(examinedSoFar);
          setSnapshots(new Map(merged));
        }

        if (livingRoom) await yieldToMain();
      }

      if (!cancelled && cacheBatch.length > 0) {
        setCachedEpgTitlesBatch(creds.server, creds.username, cacheBatch);
      }

      if (!cancelled) {
        setExamined(scanIds.length);
        setSnapshots(new Map(merged));
        setLoading(false);
        const titles = [...merged.values()]
          .map((s) => s.nowTitle)
          .filter((t): t is string => Boolean(t?.trim()));
        if (titles.length > 0) void prefetchArtworkTitles(titles.slice(0, 24));
      }
    };

    if (effectiveDefer > 0) {
      deferTimer = setTimeout(() => {
        if (!cancelled) void runScan();
      }, effectiveDefer);
    } else {
      void runScan();
    }

    return () => {
      cancelled = true;
      if (deferTimer) clearTimeout(deferTimer);
    };
  }, [
    active,
    candidateIds,
    creds,
    queryClient,
    deferMs,
    epgConcurrency,
    fastScanCount,
    livingRoom,
    priorityStreamIds,
  ]);

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(
      () => setNowSec(Math.floor(Date.now() / 1000)),
      60_000
    );
    return () => clearInterval(id);
  }, []);

  const { onNow, tonight } = useMemo(() => {
    const onNowList: ScoredLiveEntry[] = [];
    const tonightList: ScoredLiveEntry[] = [];

    for (const [streamId, snap] of snapshots) {
      const stream = channelById.get(streamId);
      if (!stream) continue;

      if (snap.nowTitle) {
        onNowList.push({
          stream,
          programmeTitle: snap.nowTitle,
          score: scoreOnNowEntry(stream, snap.nowTitle, recentIds, favIds),
        });
      }

      if (snap.tonight && snap.tonight.title) {
        const detail = formatTonightDetail(snap.tonight, nowSec);
        tonightList.push({
          stream,
          programmeTitle: snap.tonight.title,
          detail,
          score: scoreTonightEntry(
            stream,
            snap.tonight,
            recentIds,
            favIds,
            nowSec
          ),
        });
      }
    }

    onNowList.sort((a, b) => b.score - a.score);
    tonightList.sort((a, b) => b.score - a.score);

    const dedupeTonight = tonightList.filter(
      (entry) =>
        !onNowList.some(
          (n) =>
            n.stream.stream_id === entry.stream.stream_id &&
            n.programmeTitle === entry.programmeTitle
        )
    );

    return {
      onNow: filterScoredLiveEntries(onNowList).slice(0, 24),
      tonight: filterScoredLiveEntries(dedupeTonight).slice(0, 24),
    };
  }, [snapshots, channelById, recentIds, favIds, nowSec]);

  const coverage =
    candidateIds.length > 0 ? examined / candidateIds.length : 0;
  const withNow = onNow.length;
  const minShelfItems = livingRoom
    ? tvLiveDiscoveryMinItems()
    : LIVE_DISCOVERY_MIN_ITEMS;
  const minSportsItems = livingRoom
    ? tvSportsShelfMinItems()
    : SPORTS_SHELF_MIN_ITEMS;

  const showOnNow = onNow.length > 0;
  const showTonight = tonight.length >= minShelfItems;

  const sportsQuery = useDiscoverySports();
  const cachedSportsEvents = sportsQuery.data?.events;

  const { sportsMatched, sportsOnGuide } = useMemo(() => {
    const sportsEvents = cachedSportsEvents ?? [];
    if (!active || sportsEvents.length === 0 || snapshots.size === 0) {
      return { sportsMatched: [] as ScoredLiveEntry[], sportsOnGuide: [] as ScoredLiveEntry[] };
    }

    const matches = matchEventsToChannels(
      sportsEvents,
      snapshots,
      channelById
    );
    const matched = eventMatchesToScoredEntries(
      matches,
      recentIds,
      favIds
    );
    const matchedIds = new Set(matched.map((e) => e.stream.stream_id));
    const guideRaw = buildSportsOnGuideEntries(
      snapshots,
      channelById,
      matchedIds
    );
    const onGuide = sportsGuideToScoredEntries(
      guideRaw,
      recentIds,
      favIds
    );

    return { sportsMatched: matched, sportsOnGuide: onGuide };
  }, [active, cachedSportsEvents, snapshots, channelById, recentIds, favIds]);

  const showSportsEvents = sportsMatched.length >= minSportsItems;
  const showSportsOnGuide =
    sportsOnGuide.length >= minSportsItems && !showSportsEvents;

  const trendingOnTv = useMemo(() => {
    if (!active || !isLiveTrendingShelfEnabled()) return [];
    const scanCap = Math.min(maxScan, LIVE_TRENDING_ON_TV_MAX_SCAN);
    const ids = candidateIds.slice(0, scanCap);
    return buildLiveTrendingOnTv(
      ids,
      channelById,
      snapshots,
      tmdbTrending,
      recentIds,
      favIds
    );
  }, [
    active,
    candidateIds,
    maxScan,
    channelById,
    snapshots,
    tmdbTrending,
    recentIds,
    favIds,
  ]);

  const showTrendingOnTv = shouldShowTrendingOnTvShelf(trendingOnTv);

  return {
    trendingOnTv,
    showTrendingOnTv,
    onNow,
    tonight,
    sportsEvents: sportsMatched,
    sportsOnGuide,
    loading: loading && onNow.length === 0,
    sportsLoading: sportsQuery.isLoading && sportsMatched.length === 0,
    showOnNow,
    showTonight,
    showSportsEvents,
    showSportsOnGuide,
    coverage,
    withNow,
    examined,
    totalCandidates: candidateIds.length,
  };
}
