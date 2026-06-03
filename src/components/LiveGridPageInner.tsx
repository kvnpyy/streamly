"use client";

import { ActiveCategoryFilterBar } from "@/components/ActiveCategoryFilterBar";
import { LiveChannelSearchField } from "@/components/LiveChannelSearchField";
import { CategoryPicker } from "@/components/CategoryPicker";
import { LiveMediaCard } from "@/components/LiveMediaCard";
import { MobileCategoryRail } from "@/components/MobileCategoryRail";
import { LiveCategoryBrowseModal } from "@/components/LiveCategoryBrowseModal";
import { VirtualLiveChannelGrid } from "@/components/VirtualMediaCatalogGrid";
import { LiveGuidePanel } from "@/components/live/LiveGuidePanel";
import { LiveChannelGridTile } from "@/components/live/LiveChannelGridTile";
import {
  LIVE_GUIDE_MAX_CHANNELS,
  LIVE_LIST_MAX_CHANNELS,
} from "@/lib/live-guide-limits";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import {
  fetchLiveCategoryChannels,
  liveCategoryChannelsQueryOptions,
} from "@/lib/live-catalog-channels";
import { catalogKeys } from "@/lib/catalog-queries";
import { EMPTY_LIVE_STREAMS } from "@/lib/live-browse-streams";
import { scheduleLiveBrowseUiReady } from "@/lib/live-page-performance";
import { useLiveDiscoveryEpg } from "@/hooks/use-live-discovery-epg";
import { SHORT_EPG_NOW_PLAYING_LIMIT } from "@/lib/epg-constants";
import { shortEpgQueryOptions } from "@/lib/epg-query-options";
import { setCachedEpgTitlesBatch } from "@/lib/epg-local-cache";
import {
  mergeLiveSearchResults,
  planLiveProgrammeSearch,
  seedProgrammeSearchFromCache,
} from "@/lib/live-programme-search";
import { useDebouncedValue } from "@/lib/use-debounce";
import {
  tvHomeDiscoveryDeferMs,
  tvLivePageDiscoveryDeferMs,
  tvLiveSearchEpgConcurrency,
  tvLiveSearchMaxScanChannels,
  tvLiveSearchMinQueryLength,
  tvLiveSearchProgrammeDeferMs,
} from "@/lib/tv-playback-tune";
import { useRafBatchedMap } from "@/hooks/use-raf-batched-map";
import { yieldToMain } from "@/lib/yield-to-main";
import { cn } from "@/lib/utils";
import type { LiveStream } from "@/lib/xtream-types";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
} from "@/lib/live-flip-playlist";
import { openLiveShelfChannel } from "@/lib/open-live-shelf-channel";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { nowPlayingTitleFromListings } from "@/lib/hooks";
import {
  buildLiveChannelIndex,
  filterLiveChannelsByName,
} from "@/lib/live-channel-index";
import {
  isLivePageDiscoveryEnabled,
  isLiveProgrammeSearchEnabled,
  isLiveTileEpgEnabled,
} from "@/lib/live-epg-policy";
import { usePlayerOpen } from "@/lib/use-player-open";
import type { LivePageShell } from "@/hooks/use-live-page-shell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  LayoutList,
  Loader2,
  Radio,
  Layers,
} from "lucide-react";
import dynamic from "next/dynamic";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const LiveAllCategoriesBrowse = dynamic(
  () =>
    import("@/components/LiveAllCategoriesBrowse").then((m) => ({
      default: m.LiveAllCategoriesBrowse,
    })),
  { loading: () => <SkeletonGrid variant="tile" count={6} /> }
);

const LiveDiscoverySections = dynamic(
  () =>
    import("@/components/LiveDiscoverySections").then((m) => ({
      default: m.LiveDiscoverySections,
    })),
  { ssr: false, loading: () => null }
);

const LIVE_SEARCH_EPG_FLUSH_EVERY_BATCHES = 2;

export function LiveGridPageInner({ shell }: { shell: LivePageShell }) {
  const {
    creds,
    tvBrowser,
    tvLivingRoom,
    catalog,
    cats,
    streams,
    sortedFilteredCats,
    countById,
    categoryNameById,
    selected,
    setCategory,
    view,
    setViewMode,
    viewSwitchPending,
    q,
    setQ,
    clearLiveSearch,
    qTrim,
    qLower,
    liveSearchRef,
    hideAdult,
    parentalUnlocked,
    filteredCats,
  } = shell;

  const playerOpen = usePlayerOpen();
  const { play } = usePlayer();
  const isFavorite = usePrefs((s) => s.isFavorite);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const addRecent = usePrefs((s) => s.addRecent);
  const recents = usePrefs((s) => s.recents);
  const favorites = usePrefs((s) => s.favorites);
  const programmeSearchOn = isLiveProgrammeSearchEnabled();
  const [categoryBrowseOpen, setCategoryBrowseOpen] = useState(false);
  const deferredSelected = useDeferredValue(selected);
  const [guideReady, setGuideReady] = useState(false);
  useEffect(() => {
    if (view !== "guide") {
      queueMicrotask(() => setGuideReady(false));
      return;
    }
    return scheduleLiveBrowseUiReady(() => setGuideReady(true), 60);
  }, [view]);

  const [nowPlayingMap, setNowPlayingMap] = useState<Map<number, string>>(
    () => new Map()
  );
  const nowPlayingBatchRef = useRef<Map<number, string | undefined>>(new Map());
  const nowPlayingBatchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const flushNowPlayingBatch = useCallback(() => {
    const batch = nowPlayingBatchRef.current;
    if (batch.size === 0) return;
    nowPlayingBatchRef.current = new Map();
    setNowPlayingMap((prev) => {
      let next: Map<number, string> | null = null;
      const touch = (id: number, title: string | undefined) => {
        const prevTitle = (next ?? prev).get(id);
        if (title) {
          if (prevTitle === title) return;
          if (!next) next = new Map(next ?? prev);
          next.set(id, title);
          return;
        }
        if (prevTitle === undefined) return;
        if (!next) next = new Map(next ?? prev);
        next.delete(id);
      };
      for (const [id, title] of batch) touch(id, title);
      return next ?? prev;
    });
  }, []);
  const reportNowPlaying = useCallback(
    (id: number) => (title: string | undefined) => {
      nowPlayingBatchRef.current.set(id, title);
      if (nowPlayingBatchTimerRef.current) return;
      nowPlayingBatchTimerRef.current = setTimeout(() => {
        nowPlayingBatchTimerRef.current = null;
        flushNowPlayingBatch();
      }, tvLivingRoom ? 400 : 200);
    },
    [flushNowPlayingBatch, tvLivingRoom]
  );
  useEffect(
    () => () => {
      if (nowPlayingBatchTimerRef.current) {
        clearTimeout(nowPlayingBatchTimerRef.current);
      }
    },
    []
  );

  const channelListLimit =
    view === "guide" ? LIVE_GUIDE_MAX_CHANNELS : LIVE_LIST_MAX_CHANNELS;

  const shouldLoadChannelList =
    
    catalog.isFetched &&
    !catalog.isError;

  const categoryChannelsQuery = useQuery(
    liveCategoryChannelsQueryOptions(
      creds,
      deferredSelected,
      channelListLimit,
      shouldLoadChannelList
    )
  );

  const categoryFilteredStreams = useMemo(() => {
    return categoryChannelsQuery.data ?? EMPTY_LIVE_STREAMS;
  }, [categoryChannelsQuery.data]);

  const channelsLoading =
    categoryChannelsQuery.isLoading || categoryChannelsQuery.isFetching;

  const deferredBrowseCategories = useDeferredValue(sortedFilteredCats);
  const streamsForShelfBrowse = EMPTY_LIVE_STREAMS;

  const [browseUiReady, setBrowseUiReady] = useState(false);
  useEffect(() => {
    if (streams.isLoading || !catalog.data?.categories?.length) {
      queueMicrotask(() => setBrowseUiReady(false));
      return;
    }
    return scheduleLiveBrowseUiReady(() => setBrowseUiReady(true));
  }, [streams.isLoading, catalog.data?.categories?.length]);

  const liveSearchLimits = useMemo(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    return {
      maxScan: tvLiveSearchMaxScanChannels(ua),
      concurrency: tvLiveSearchEpgConcurrency(ua),
      minLen: tvLiveSearchMinQueryLength(ua),
      programmeDeferMs: tvLiveSearchProgrammeDeferMs(ua),
    };
  }, []);

  const programmeSearchQLower = useDebouncedValue(
    programmeSearchOn && qLower.length >= liveSearchLimits.minLen ? qLower : "",
    liveSearchLimits.programmeDeferMs
  );
  const programmeSearchCatchUp =
    Boolean(qTrim) && qLower !== programmeSearchQLower;

  const categoryChannelIndex = useMemo(
    () =>
      categoryFilteredStreams.length
        ? buildLiveChannelIndex(categoryFilteredStreams)
        : null,
    [categoryFilteredStreams]
  );

  const scanPlan = useMemo(() => {
    if (
      !programmeSearchQLower ||
      programmeSearchQLower.length < liveSearchLimits.minLen ||
      !categoryChannelIndex
    ) {
      return null;
    }
    return planLiveProgrammeSearch(
      categoryChannelIndex,
      programmeSearchQLower,
      liveSearchLimits.maxScan
    );
  }, [categoryChannelIndex, programmeSearchQLower, liveSearchLimits]);

  const scanCandidateIds = scanPlan?.candidateIds ?? [];
  const programLookupTruncated = scanPlan?.truncated ?? false;

  const queryClient = useQueryClient();
  const [epgSearchTitleByStreamId, setEpgSearchTitleByStreamId] =
    useRafBatchedMap<number, string>();
  const [searchScanning, setSearchScanning] = useState(false);
  const [searchScanProgress, setSearchScanProgress] = useState<{
    examined: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    if (!programmeSearchOn) return;
    if (playerOpen) return;
    if (!programmeSearchQLower || scanCandidateIds.length === 0) {
      queueMicrotask(() => {
        setEpgSearchTitleByStreamId(new Map());
        setSearchScanning(false);
        setSearchScanProgress(null);
      });
      return;
    }

    /** Snapshot at scan start — avoids restarting the whole scan when the guide updates titles. */
    const nowPlayingSnapshot = new Map(nowPlayingMap);

    /**
     * Same relative order as the filtered channel list (e.g. USA category),
     * but fetch short-EPG first for rows that already reported an on-air title
     * in the guide — those often match with zero extra latency.
     */
    const candidates = [...scanCandidateIds].sort((a, b) => {
      const ma = nowPlayingSnapshot.has(a);
      const mb = nowPlayingSnapshot.has(b);
      if (ma !== mb) return ma ? -1 : 1;
      return a - b;
    });
    const total = candidates.length;
    const { hits: indexMap, knownIds: cacheKnownIds } =
      seedProgrammeSearchFromCache(creds, candidates, programmeSearchQLower);
    const pendingCount = candidates.filter((id) => !cacheKnownIds.has(id)).length;
    queueMicrotask(() => {
      setEpgSearchTitleByStreamId(new Map(indexMap));
      setSearchScanning(pendingCount > 0);
      setSearchScanProgress(
        total > 0 ? { examined: cacheKnownIds.size, total } : null
      );
    });

    let cancelled = false;

    const epgConcurrency = liveSearchLimits.concurrency;

    void (async () => {
      let batchesDone = 0;
      const cacheBatch: Array<{ streamId: number; title: string }> = [];
      for (let i = 0; i < candidates.length; i += epgConcurrency) {
        if (cancelled) break;

        const slice = candidates.slice(i, i + epgConcurrency);
        const nowSec = Math.floor(Date.now() / 1000);

        await Promise.all(
          slice.map(async (streamId) => {
            if (cacheKnownIds.has(streamId)) return;
            try {
              const data = await queryClient.fetchQuery(
                shortEpgQueryOptions(
                  creds,
                  streamId,
                  SHORT_EPG_NOW_PLAYING_LIMIT
                )
              );
              if (cancelled) return;
              const listings = data?.epg_listings;
              if (!listings?.length) return;
              const title = nowPlayingTitleFromListings(listings, nowSec);
              if (title) {
                indexMap.set(streamId, title);
                cacheBatch.push({ streamId, title });
              }
            } catch {
              /* network — skip */
            }
          })
        );

        if (cancelled) break;

        const examined = Math.min(i + epgConcurrency, candidates.length);
        setSearchScanProgress({ examined, total });

        batchesDone += 1;
        const isLast = i + epgConcurrency >= candidates.length;
        const flushEvery = tvLivingRoom
          ? LIVE_SEARCH_EPG_FLUSH_EVERY_BATCHES + 2
          : LIVE_SEARCH_EPG_FLUSH_EVERY_BATCHES;
        if (isLast || batchesDone % flushEvery === 0) {
          setEpgSearchTitleByStreamId(new Map(indexMap));
        }

        await yieldToMain();
      }

      if (!cancelled) {
        if (cacheBatch.length > 0) {
          setCachedEpgTitlesBatch(creds.server, creds.username, cacheBatch);
        }
        setSearchScanning(false);
        setSearchScanProgress(null);
        setEpgSearchTitleByStreamId(new Map(indexMap));
      }
    })();

    return () => {
      cancelled = true;
      queueMicrotask(() => {
        setSearchScanning(false);
        setSearchScanProgress(null);
      });
    };
    // `nowPlayingMap` is read only for a snapshot when the query changes — omit from deps
    // so we don't restart a full EPG scan on every guide title tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional snapshot on query change
  }, [
    playerOpen,
    programmeSearchQLower,
    scanCandidateIds,
    queryClient,
    creds,
    liveSearchLimits.concurrency,
    tvLivingRoom,
    programmeSearchOn,
  ]);

  const deferredFilteredForSearch = useDeferredValue(
    qLower ? categoryFilteredStreams : []
  );

  const deferredChannelIndex = useMemo(() => {
    if (!deferredFilteredForSearch.length) return null;
    return buildLiveChannelIndex(deferredFilteredForSearch);
  }, [deferredFilteredForSearch]);

  const nameMatched = useMemo(() => {
    if (!qLower) return categoryFilteredStreams;
    if (!deferredChannelIndex) return [];
    return filterLiveChannelsByName(deferredChannelIndex, qLower);
  }, [deferredChannelIndex, qLower, categoryFilteredStreams]);

  const visible = useMemo(() => {
    if (!qLower) return categoryFilteredStreams;
    if (!programmeSearchOn) return nameMatched;
    return mergeLiveSearchResults(
      nameMatched,
      categoryFilteredStreams,
      qLower,
      nowPlayingMap,
      epgSearchTitleByStreamId
    );
  }, [
    categoryFilteredStreams,
    qLower,
    nameMatched,
    programmeSearchOn,
    nowPlayingMap,
    epgSearchTitleByStreamId,
  ]);

  const displayVisible = useDeferredValue(visible);

  // Build the source for one channel.
  const toSource = useCallback(
    (c: LiveStream) => liveStreamToPlayerSource(creds, c),
    [creds]
  );

  // Build the flip-playlist from whatever is currently visible. Cap to a
  // reasonable size so the playlist payload doesn't bloat for big providers.
  const flipPlaylist = useMemo(
    () => buildLiveFlipPlaylist(creds, displayVisible.slice(0, 48)),
    [creds, displayVisible]
  );

  const openChannel = useCallback(
    (c: LiveStream) => {
      play(toSource(c), {
        playlist: flipPlaylist,
      });
      addRecent({
        kind: "live",
        id: c.stream_id,
        name: c.name,
        icon: c.stream_icon,
        ...(c.direct_source?.trim()
          ? { meta: { direct_source: c.direct_source.trim() } }
          : {}),
      });
    },
    [play, addRecent, toSource, flipPlaylist]
  );

  const shelfOpenChannel = useCallback(
    (
      c: LiveStream,
      shelf?: import("@/lib/live-category-shelf").LiveShelfMeta
    ) => {
      if (shelf) {
        openLiveShelfChannel(creds, c, shelf);
      } else {
        play(toSource(c), {
          playlist: buildLiveFlipPlaylist(creds, [c]),
        });
      }
      addRecent({
        kind: "live",
        id: c.stream_id,
        name: c.name,
        icon: c.stream_icon,
        ...(c.direct_source?.trim()
          ? { meta: { direct_source: c.direct_source.trim() } }
          : {}),
      });
    },
    [addRecent, creds, play, toSource]
  );

  const [liveDiscoveryReady, setLiveDiscoveryReady] = useState(false);
  useEffect(() => {
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const ms = tvLivingRoom ? tvLivePageDiscoveryDeferMs(ua) : 2_500;
    const t = setTimeout(() => setLiveDiscoveryReady(true), ms);
    return () => clearTimeout(t);
  }, [tvLivingRoom]);

  /** Discovery EPG only on "All" grid/guide — never while a single category is open. */
  const discoveryEpgEnabled =
    isLivePageDiscoveryEnabled() &&
    !qTrim &&
    view === "list" &&
    !streams.isLoading &&
    liveDiscoveryReady &&
    selected === "all" &&
    categoryFilteredStreams.length > 0 &&
    categoryFilteredStreams.length <= 120;

  const liveDiscovery = useLiveDiscoveryEpg({
    channels: categoryFilteredStreams,
    creds,
    recents,
    favorites,
    enabled: discoveryEpgEnabled,
    livingRoom: tvLivingRoom,
    deferMs: tvLivingRoom
      ? tvHomeDiscoveryDeferMs(
          typeof navigator !== "undefined" ? navigator.userAgent : ""
        )
      : 0,
  });

  const toggleLiveStreamFavorite = useCallback(
    (c: LiveStream) => {
      toggleFavorite({
        kind: "live",
        id: c.stream_id,
        name: c.name,
        icon: c.stream_icon,
        ...(c.direct_source?.trim()
          ? { meta: { direct_source: c.direct_source.trim() } }
          : {}),
      });
    },
    [toggleFavorite]
  );

  const recentLiveIds = useMemo(
    () =>
      recents
        .filter((r) => r.kind === "live")
        .slice(0, 12)
        .map((r) => r.id),
    [recents]
  );

  const recentStreamsQuery = useQuery({
    queryKey: [
      ...catalogKeys.live(creds),
      "channels",
      "recents",
      recentLiveIds.join(","),
    ] as const,
    queryFn: ({ signal }) =>
      fetchLiveCategoryChannels(creds, {
        categoryId: "all",
        streamIds: recentLiveIds,
        limit: 12,
        signal,
      }),
    enabled: recentLiveIds.length > 0 && catalog.isFetched ,
    staleTime: 60_000,
    structuralSharing: false,
  });

  const liveRecentStreams = useMemo(() => {
    const byId = new Map(
      (recentStreamsQuery.data ?? []).map((s) => [s.stream_id, s])
    );
    return recents
      .filter((r) => r.kind === "live")
      .slice(0, 12)
      .map((recent) => ({ recent, stream: byId.get(recent.id) }))
      .filter(
        (
          x
        ): x is {
          recent: (typeof recents)[0];
          stream: NonNullable<typeof x.stream>;
        } => x.stream !== undefined
      );
  }, [recents, recentStreamsQuery.data]);

  const liveDiscoveryBlocks = discoveryEpgEnabled ? (
    <LiveDiscoverySections
      creds={creds}
      channels={categoryFilteredStreams}
      recents={recents}
      favorites={favorites}
      hideAdult={hideAdult}
      parentalUnlocked={parentalUnlocked}
      tvLayout={tvLivingRoom}
      onNow={liveDiscovery.onNow}
      tonight={liveDiscovery.tonight}
      sportsEvents={liveDiscovery.sportsEvents}
      sportsOnGuide={liveDiscovery.sportsOnGuide}
      showOnNow={liveDiscovery.showOnNow}
      showTonight={liveDiscovery.showTonight}
      showSportsEvents={liveDiscovery.showSportsEvents}
      showSportsOnGuide={liveDiscovery.showSportsOnGuide}
      loading={liveDiscovery.loading}
      sportsLoading={liveDiscovery.sportsLoading}
      showFeaturedFallback={liveRecentStreams.length === 0}
      onPlay={openChannel}
      isFavorite={(id) => isFavorite("live", id)}
      onToggleFavorite={toggleLiveStreamFavorite}
    />
  ) : null;

  const matchedByProgramCount = useMemo(() => {
    if (!qLower || !programmeSearchOn) return 0;
    return Math.max(0, visible.length - nameMatched.length);
  }, [visible.length, nameMatched.length, qLower, programmeSearchOn]);

  const selectedCategoryName = useMemo(() => {
    if (selected === "all") return "";
    const sid = String(selected);
    return (
      categoryNameById[sid] ||
      filteredCats.find((c) => String(c.category_id) === sid)?.category_name ||
      ""
    );
  }, [selected, categoryNameById, filteredCats]);

  const liveSearchToolbar = (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
        <button
          type="button"
          onClick={() => setCategoryBrowseOpen(true)}
          className="lg:hidden inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl border border-(--line) bg-(--bg-2) text-xs font-medium text-(--text-dim) hover:text-(--text) hover:border-(--brand)/40 shrink-0"
          aria-label="Open category browser"
        >
          <Layers className="size-3.5" aria-hidden />
          Categories
        </button>
        <GridViewToggle
          view={view}
          setView={setViewMode}
          pending={viewSwitchPending}
        />
      </div>
      <LiveChannelSearchField
        ref={liveSearchRef}
        value={q}
        onValueChange={setQ}
        onClear={q ? clearLiveSearch : undefined}
        className={cn(
          "min-w-0",
          tvLivingRoom ? "flex flex-1" : "hidden lg:flex"
        )}
      />
    </div>
  );

  /* ── TV-class browsers: discovery rows + category shelves ── */
  if (tvBrowser) {
    return (
      <div className="space-y-6">
        <SectionHeader
          hideDescriptionOnMobile
          eyebrow="Watch live"
          title="Live TV"
          description="Browse channels by category. Use search to find a channel or on-air programme."
          right={liveSearchToolbar}
        />
        {liveDiscoveryBlocks}
        {browseUiReady ? (
          <LiveAllCategoriesBrowse
            variant="tv"
            categories={deferredBrowseCategories}
            streams={streamsForShelfBrowse}
            countByCategoryId={catalog.data?.countByCategoryId}
            creds={creds}
            openChannel={shelfOpenChannel}
            isFavorite={(id) => isFavorite("live", id)}
            favorites={favorites}
            reportNowPlaying={undefined}
          />
        ) : (
          <SkeletonGrid variant="tile" count={4} />
        )}
      </div>
    );
  }

  const categorySwitchPending = deferredSelected !== selected;

  return (
    <div
      className={cn("space-y-5", categorySwitchPending && "opacity-70")}
      aria-busy={categorySwitchPending || undefined}
    >
      <SectionHeader
        hideDescriptionOnMobile
        eyebrow="Watch live"
        title="Live TV"
        description={
          selected === "all"
            ? "Browse all live channels grouped by category. Click any channel to start streaming instantly."
            : `Showing channels in “${selectedCategoryName || "this category"}”. Use the sidebar or clear below to see everything again.`
        }
        right={liveSearchToolbar}
      />

      {!qTrim && liveRecentStreams.length > 0 && (
        <section>
          <div className="mb-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
              Pick up where you left off
            </p>
            <h2 className="text-base font-bold text-(--text)">Continue Watching</h2>
          </div>
          <div
            className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            {liveRecentStreams.map(({ recent, stream }) => (
              <div key={recent.id} className="shrink-0 w-28 sm:w-32">
                <LiveMediaCard
                  streamId={recent.id}
                  creds={creds}
                  skipTileEpg
                  title={recent.name}
                  poster={recent.icon}
                  posterFit="contain"
                  badge="Live"
                  onClick={() => openChannel(stream)}
                  isFavorite={isFavorite("live", recent.id)}
                  onToggleFavorite={() =>
                    toggleFavorite({
                      kind: "live",
                      id: recent.id,
                      name: recent.name,
                      icon: recent.icon,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {!qTrim && <div className="space-y-6">{liveDiscoveryBlocks}</div>}

      {programmeSearchOn && qTrim && searchScanning && searchScanProgress && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          className="flex items-start gap-3 rounded-xl border border-(--line) bg-(--bg-2) px-3.5 py-3 sm:px-4"
        >
          <Loader2
            className="size-4 shrink-0 text-(--brand) animate-spin mt-0.5"
            aria-hidden
          />
          <div className="min-w-0 space-y-1 text-xs sm:text-sm">
            <p className="font-medium text-(--text)">
              Still searching programme titles
            </p>
            {programmeSearchCatchUp && (
              <p className="text-[11px] text-(--brand-2) leading-snug">
                Catching up to your typing — channel names in this view already
                filter live.
              </p>
            )}
            <p className="text-(--text-muted) text-pretty leading-relaxed">
              Scanning channels in{" "}
              <strong className="text-(--text)">
                {selected === "all" ? "this list" : `“${selectedCategoryName || "this category"}”`}
              </strong>{" "}
              that don&apos;t match your text as a channel name, prioritizing
              ones we already know are on-air (
              {searchScanProgress.examined.toLocaleString()} /{" "}
              {searchScanProgress.total.toLocaleString()}
              ). Matches appear as we go; pick a category to shrink the scan.
            </p>
          </div>
        </div>
      )}

      {!cats.isLoading && (
        <MobileCategoryRail
          categories={sortedFilteredCats}
          value={selected}
          onChange={setCategory}
          countById={countById}
          label="Browse"
        />
      )}

      {selected !== "all" && (
        <ActiveCategoryFilterBar
          categoryName={selectedCategoryName || "Selected category"}
          count={streams.isLoading ? undefined : visible.length}
          countLabel={
            visible.length === 1 ? "channel in view" : "channels in view"
          }
          onClear={() => setCategory("all")}
        />
      )}

      <LiveCategoryBrowseModal
        open={categoryBrowseOpen}
        onClose={() => setCategoryBrowseOpen(false)}
        categories={sortedFilteredCats}
        value={selected}
        countById={countById}
        onChange={setCategory}
      />

      {catalog.isError && (
        <div className="card p-6 flex flex-col sm:flex-row sm:items-center gap-4">
          <p className="text-sm text-(--text-muted) flex-1">
            Could not load the channel list. Check your connection and try again.
          </p>
          <button
            type="button"
            className="btn-brand px-4 py-2 text-sm font-medium shrink-0"
            onClick={() => void catalog.refetch()}
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        <div
          className={cn(
            "hidden lg:block col-span-12 lg:col-span-3 xl:col-span-3",
            tvBrowser && "!hidden"
          )}
        >
          {cats.isLoading ? (
            <div className="card p-3 space-y-2">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-8 rounded-lg" />
              ))}
            </div>
          ) : (
            <CategoryPicker
              categories={sortedFilteredCats}
              value={selected}
              onChange={setCategory}
              countById={countById}
            />
          )}
        </div>

        <div
          className={cn(
            "col-span-12 lg:col-span-9 xl:col-span-9",
            tvBrowser && "lg:col-span-12 xl:col-span-12"
          )}
        >
          {streams.isLoading ||
          channelsLoading ||
          false ||
          deferredSelected !== selected ? (
            <SkeletonGrid variant="tile" count={12} />
          ) : visible.length === 0 ? (
            programmeSearchOn && qTrim && searchScanning ? (
              <div className="card p-10 sm:p-12 text-center">
                <p className="text-sm text-(--text-muted) text-pretty max-w-md mx-auto leading-relaxed">
                  No channel names match &ldquo;{qTrim}&rdquo; yet. Programme
                  matches will show here as they&apos;re found — see the status
                  banner above. Picking a category speeds this up.
                </p>
              </div>
            ) : (
              <GridEmpty
                hasSearch={Boolean(qTrim)}
                categoryFiltered={selected !== "all"}
              />
            )
          ) : view === "guide" ? (
            guideReady ? (
              <LiveGuidePanel
                channels={displayVisible}
                allCategoriesMode={selected === "all"}
                categoryNameById={categoryNameById}
                isFavorite={(id) => isFavorite("live", id)}
                onToggleFavorite={(c) =>
                  toggleFavorite({
                    kind: "live",
                    id: c.stream_id,
                    name: c.name,
                    icon: c.stream_icon,
                    ...(c.direct_source?.trim()
                      ? { meta: { direct_source: c.direct_source.trim() } }
                      : {}),
                  })
                }
                onPlay={(c) => openChannel(c)}
              />
            ) : (
              <SkeletonGrid variant="tile" count={6} />
            )
          ) : (
            <>
              {programmeSearchOn && qTrim && programLookupTruncated && (
                <div className="mb-2 text-xs text-(--text-muted)">
                  On-air title search scans up to{" "}
                  {liveSearchLimits.maxScan.toLocaleString()} channels (excluding
                  name matches).
                  Pick a category or refine the query for broader coverage.
                </div>
              )}
              {programmeSearchOn && qTrim && matchedByProgramCount > 0 && (
                <div className="mb-3 text-xs text-(--text-muted) space-y-1">
                  <p>
                    {matchedByProgramCount} match
                    {matchedByProgramCount === 1 ? "" : "es"} from on-air
                    programmes.
                  </p>
                  {searchScanning && (
                    <p className="flex items-center gap-1.5 text-(--text-dim)">
                      <Loader2
                        className="size-3 shrink-0 animate-spin"
                        aria-hidden
                      />
                      Still scanning — more may appear shortly.
                    </p>
                  )}
                </div>
              )}
              <VirtualLiveChannelGrid
                items={displayVisible}
                maxItems={LIVE_LIST_MAX_CHANNELS}
                itemKey={(c) => c.stream_id}
                renderItem={(c) => (
                  <LiveChannelGridTile
                    stream={c}
                    categoryLine={categoryNameById[c.category_id]}
                    knownNowPlaying={
                      nowPlayingMap.get(c.stream_id) ??
                      epgSearchTitleByStreamId.get(c.stream_id)
                    }
                    isFavorite={isFavorite("live", c.stream_id)}
                    onNowPlaying={
                      isLiveTileEpgEnabled() && displayVisible.length <= 64
                        ? reportNowPlaying(c.stream_id)
                        : undefined
                    }
                    onToggleFavorite={() =>
                      toggleFavorite({
                        kind: "live",
                        id: c.stream_id,
                        name: c.name,
                        icon: c.stream_icon,
                        ...(c.direct_source?.trim()
                          ? { meta: { direct_source: c.direct_source.trim() } }
                          : {}),
                      })
                    }
                    onPlay={() => openChannel(c)}
                  />
                )}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GridEmpty({
  hasSearch,
  categoryFiltered,
}: {
  hasSearch: boolean;
  categoryFiltered: boolean;
}) {
  const hint =
    hasSearch && categoryFiltered
      ? "Try clearing the search box or switching back to All categories."
      : hasSearch
        ? "Try clearing the search box."
        : categoryFiltered
          ? 'Try choosing "All" categories or pick a different group.'
          : null;

  return (
    <div className="card p-10 sm:p-12 flex flex-col items-center text-center gap-5">
      <div
        className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-(--brand)/22 via-(--bg-3) to-(--brand-2)/18 ring-1 ring-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.09)]"
        aria-hidden
      >
        <Radio className="size-7 text-(--brand)" strokeWidth={1.75} />
      </div>
      <div className="space-y-2 max-w-md">
        <h2 className="text-lg font-semibold text-(--text) tracking-tight text-balance">
          No channels match your filters
        </h2>
        <p className="text-sm text-(--text-dim) text-pretty">
          Adjust search or categories to see live channels in this view.
        </p>
        {hint && (
          <p className="text-xs text-(--text-muted) text-pretty pt-1">{hint}</p>
        )}
      </div>
    </div>
  );
}

function GridViewToggle({
  view,
  setView,
  pending = false,
}: {
  view: "list" | "guide";
  setView: (v: "list" | "guide") => void;
  pending?: boolean;
}) {
  const items = [
    { value: "list" as const, label: "List", icon: <LayoutList className="size-3.5" /> },
    { value: "guide" as const, label: "Guide", icon: <CalendarDays className="size-3.5" /> },
  ];
  return (
    <div
      className="flex items-center gap-1 p-1 rounded-xl bg-(--bg-2) border border-(--line) w-fit shrink-0"
      role="group"
      aria-label="Live layout"
      aria-busy={pending}
    >
      {items.map((i) => (
        <button
          key={i.value}
          type="button"
          disabled={pending}
          onClick={() => setView(i.value)}
          aria-label={`${i.label} view`}
          className={cn(
            "flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs transition-colors",
            view === i.value
              ? "bg-(--bg-3) text-(--text)"
              : "text-(--text-dim) hover:text-(--text)",
            pending && "opacity-60 cursor-wait"
          )}
          aria-pressed={view === i.value}
        >
          {i.icon}
          {i.label}
        </button>
      ))}
    </div>
  );
}
