"use client";

import { TvCategoryView } from "@/components/TvCategoryView";
import { TvChannelCard } from "@/components/TvChannelCard";
import { LiveShelfRow } from "@/components/LiveShelfRow";
import { LiveShelfList } from "@/components/LiveShelfList";
import { TvShelf } from "@/components/TvShelf";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import {
  ALL_TV_REGIONS,
  detectRegionFromTimezone,
  type TvRegion,
} from "@/lib/geo-continent";
import { filterStreamsForTvRegion, type LiveShelfMeta } from "@/lib/live-category-shelf";
import {
  EMPTY_LIVE_STREAMS,
  hasLiveServerCategoryCounts,
} from "@/lib/live-browse-streams";
import { materializeLiveCategoryStreams } from "@/lib/live-stream-filter";
import { LIVE_LIST_MAX_CHANNELS } from "@/lib/live-guide-limits";
import {
  fetchLiveCategoryChannels,
  liveCategoryChannelsQueryOptions,
} from "@/lib/live-catalog-channels";
import { fetchLiveShelfPreviews } from "@/lib/live-catalog-shelves";
import { useQuery } from "@tanstack/react-query";
import { useLiveCategoryShelves } from "@/hooks/use-live-category-shelves";
import { useLiveOpenCategory } from "@/hooks/use-live-open-category";
import { useLiveShelfBrowse } from "@/hooks/use-live-shelf-browse";
import { openLiveShelfChannel } from "@/lib/open-live-shelf-channel";
import { SHORT_EPG_NOW_PLAYING_LIMIT } from "@/lib/epg-constants";
import { isLiveShelfEpgEnabled } from "@/lib/live-epg-policy";
import {
  getBulkCachedEpgTitles,
  getCachedEpgKnownIds,
  setCachedEpgTitlesBatch,
} from "@/lib/epg-local-cache";
import { maxConcurrentEpgFetches } from "@/lib/epg-fetch-limiter";
import { nowPlayingTitleFromListings, SHORT_EPG_STALE_MS } from "@/lib/hooks";
import { runWithConcurrency } from "@/lib/run-with-concurrency";
import { prefetchLiveStreamManifest } from "@/lib/live-stream-prefetch";
import { buildLivePlayUrl, xtream } from "@/lib/xtream";
import type { Category, LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { usePlayer } from "@/store/player";
import type { Favorite } from "@/store/preferences";
import { usePrefs } from "@/store/preferences";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Radio, Search } from "lucide-react";
import Link from "next/link";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/** Channels shown per shelf. */
// 5 cards per shelf: with wider cards (~220px) at 1280px viewport width, ~5 are
// fully visible and the OverflowCard is always partially visible at the right edge,
// giving users a clear affordance that more channels exist in that category.
const MAX_PER_SHELF = 5;
/** Shelves rendered on first paint — keep very low for TV browser speed. */
const INITIAL_SHELF_COUNT = 4;
const SHELF_LOAD_INCREMENT = 1;
const SHELF_EPG_SCAN_MAX = 8;

export type TvLiveBrowseProps = {
  categories: Category[];
  streams: LiveStream[];
  loading: boolean;
  creds: XtreamCredentials;
  openChannel: (c: LiveStream) => void;
  isFavorite: (id: number) => boolean;
  favorites: Favorite[];
  /** EPG titles populated by the live page's scanner + TV's own EPG fetch. */
  nowPlayingMap: Map<number, string>;
  /** Callback to report a now-playing title (mirrors LiveChannelTile contract). */
  reportNowPlaying?: (id: number) => (title: string | undefined) => void;
  /** When set (from `/api/live/catalog`), skips an O(n) grouping pass on the client. */
  streamIdsByCategory?: Record<string, number[]>;
  countByCategoryId?: Record<string, number>;
  streamById?: Map<number, LiveStream>;
};

export function TvLiveBrowse(props: TvLiveBrowseProps) {
  if (hasLiveServerCategoryCounts(props.countByCategoryId)) {
    return <TvLiveBrowsePaged {...props} />;
  }
  return <TvLiveBrowseFull {...props} />;
}

function TvLiveBrowsePaged({
  creds,
  openChannel,
  nowPlayingMap,
}: TvLiveBrowseProps) {
  const { current } = usePlayer();
  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const setStoredRegion = usePrefs((s) => s.setTvRegionFilter);
  const { openCategoryId, openCategory, closeCategory } = useLiveOpenCategory();

  useEffect(() => {
    if (storedRegion === null) {
      setStoredRegion(detectRegionFromTimezone());
    }
  }, [storedRegion, setStoredRegion]);

  const region: TvRegion = storedRegion ?? "All";

  const {
    allShelves,
    visibleShelfCount,
    hasMore,
    shelvesBuilding,
    shelvesReadyToReveal,
    loadingMoreCategories,
    loadMoreShelves,
    resetVisible,
  } = useLiveShelfBrowse({
    creds,
    region,
    maxPerShelf: MAX_PER_SHELF,
    initialVisible: INITIAL_SHELF_COUNT,
    loadIncrement: SHELF_LOAD_INCREMENT,
    enabled: true,
  });

  const handleRegionChange = useCallback(
    (r: TvRegion) => {
      setStoredRegion(r);
      resetVisible();
    },
    [setStoredRegion, resetVisible]
  );

  const renderShelfRow = useCallback(
    (shelf: LiveShelfMeta) => (
      <LiveShelfRow
        shelf={shelf}
        maxPerShelf={MAX_PER_SHELF}
        creds={creds}
        activeStreamId={current?.id}
        nowPlayingMap={nowPlayingMap}
        onSeeAll={() => openCategory(shelf.id)}
        onPlay={(stream, shelf) => openLiveShelfChannel(creds, stream, shelf)}
      />
    ),
    [creds, current?.id, nowPlayingMap, openChannel]
  );

  const openCategoryFetched = useQuery(
    liveCategoryChannelsQueryOptions(
      creds,
      openCategoryId ?? "all",
      LIVE_LIST_MAX_CHANNELS,
      Boolean(openCategoryId)
    )
  );

  const openCategoryChannels = useDeferredValue(openCategoryFetched.data ?? []);

  const onLoadMore = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      loadMoreShelves();
    },
    [loadMoreShelves]
  );

  return (
    <>
      {openCategoryId && (
        <TvCategoryView
          title={allShelves.find((s) => s.id === openCategoryId)?.title ?? "Category"}
          categoryTitle={
            allShelves.find((s) => s.id === openCategoryId)?.title ?? "Category"
          }
          channels={openCategoryChannels}
          nowPlayingMap={nowPlayingMap}
          activeStreamId={current?.id}
          creds={creds}
          onPlay={(c) => {
            openChannel(c);
          }}
          onBack={closeCategory}
        />
      )}
      <div className="space-y-10 py-2">
        <div className="flex items-center justify-between gap-3">
          <RegionPicker region={region} onChange={handleRegionChange} />
        </div>
        <LiveShelfList<LiveShelfMeta>
          items={allShelves}
          visibleCount={visibleShelfCount}
          itemKey={(shelf) => shelf.id}
          renderItem={renderShelfRow}
          footer={
            hasMore ? (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  data-tv-card-root
                  disabled={shelvesBuilding && shelvesReadyToReveal === 0}
                  onClick={onLoadMore}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-(--line) bg-(--bg-2) text-sm font-medium text-(--text-dim) hover:text-(--text) hover:border-(--brand)/40 hover:bg-(--bg-3) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55 disabled:opacity-50"
                >
                  {loadingMoreCategories ||
                  (shelvesBuilding && shelvesReadyToReveal === 0)
                    ? "Loading categories…"
                    : shelvesReadyToReveal > 0
                      ? `Show more categories (${shelvesReadyToReveal} ready)`
                      : "Show more categories"}
                </button>
              </div>
            ) : null
          }
        />
      </div>
    </>
  );
}

function TvLiveBrowseFull({
  categories,
  streams,
  loading,
  creds,
  openChannel,
  favorites,
  nowPlayingMap,
  reportNowPlaying,
  streamIdsByCategory,
  countByCategoryId,
  streamById: catalogStreamById,
}: TvLiveBrowseProps) {
  const { current } = usePlayer();
  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const setStoredRegion = usePrefs((s) => s.setTvRegionFilter);
  const hideAdult = usePrefs((s) => s.hideAdult);
  const parentalUnlocked = usePrefs((s) => s.parentalUnlocked);
  const queryClient = useQueryClient();

  const { openCategoryId, openCategory, closeCategory } = useLiveOpenCategory();

  // Auto-detect region on first visit (storedRegion === null)
  useEffect(() => {
    if (storedRegion === null) {
      const detected = detectRegionFromTimezone();
      setStoredRegion(detected);
    }
  }, [storedRegion, setStoredRegion]);

  // The active region — use "All" while auto-detecting to avoid flash
  const region: TvRegion = storedRegion ?? "All";

  const serverCounts = hasLiveServerCategoryCounts(countByCategoryId);
  const deferredStreams = useDeferredValue(streams);

  const resolveShelfPreviews = useCallback(
    (categoryIds: string[], limitPerShelf: number) =>
      fetchLiveShelfPreviews(creds, {
        categoryIds,
        limitPerShelf,
        region,
      }),
    [creds, region]
  );

  const resolveStreamsByIds = useCallback(
    (ids: number[]) =>
      fetchLiveCategoryChannels(creds, {
        categoryId: "all",
        streamIds: ids,
        limit: ids.length,
      }),
    [creds]
  );
  const deferredCategories = useDeferredValue(categories);
  const allowedCatIds = useMemo(
    () => new Set(deferredCategories.map((c) => String(c.category_id))),
    [deferredCategories]
  );

  const shelfInputsKey = useMemo(() => {
    if (serverCounts) {
      return `${region}|${deferredCategories.length}|${deferredCategories[0]?.category_id ?? ""}|srv`;
    }
    const n = deferredStreams.length;
    return `${region}|${deferredCategories.length}|${deferredCategories[0]?.category_id ?? ""}|${n}:${deferredStreams[0]?.stream_id ?? 0}:${deferredStreams[n - 1]?.stream_id ?? 0}`;
  }, [region, deferredCategories, deferredStreams, serverCounts]);

  const {
    allShelves,
    visibleShelfCount,
    hasMore,
    shelvesBuilding,
    shelvesReadyToReveal,
    loadingMoreCategories,
    loadMoreShelves,
    resetVisible,
    streamById: shelfStreamById,
    idsByCategory: shelfIdsByCategory,
  } = useLiveCategoryShelves({
    categories: deferredCategories,
    streams: deferredStreams,
    region,
    maxPerShelf: MAX_PER_SHELF,
    initialVisible: INITIAL_SHELF_COUNT,
    loadIncrement: SHELF_LOAD_INCREMENT,
    streamIdsByCategory,
    countByCategoryId,
    streamById: catalogStreamById,
    shelfInputsKey,
    categoriesPerSlice: 4,
    resolveShelfPreviews: serverCounts ? resolveShelfPreviews : undefined,
    resolveStreamsByIds: serverCounts ? undefined : resolveStreamsByIds,
    enabled: true,
  });

  const handleRegionChange = useCallback(
    (r: TvRegion) => {
      setStoredRegion(r);
      resetVisible();
    },
    [setStoredRegion, resetVisible]
  );

  const renderShelfRow = useCallback(
    (shelf: LiveShelfMeta) => (
      <LiveShelfRow
        shelf={shelf}
        maxPerShelf={MAX_PER_SHELF}
        creds={creds}
        activeStreamId={current?.id}
        nowPlayingMap={nowPlayingMap}
        onSeeAll={() => openCategory(shelf.id)}
        onPlay={(stream, shelf) => openLiveShelfChannel(creds, stream, shelf)}
      />
    ),
    [creds, current?.id, nowPlayingMap, openChannel]
  );

  /** Favourite live channels — pinned shelf at the top. */
  const favoriteStreams = useMemo(() => {
    const favIds = favorites
      .filter((f) => f.kind === "live")
      .map((f) => f.id)
      .slice(0, MAX_PER_SHELF);
    if (catalogStreamById) {
      const out: LiveStream[] = [];
      for (const id of favIds) {
        const s = catalogStreamById.get(id);
        if (s) out.push(s);
      }
      return out;
    }
    const favSet = new Set(favIds);
    return streams.filter((s) => favSet.has(s.stream_id));
  }, [favorites, streams, catalogStreamById]);

  /**
   * Scan short EPG for the currently visible channels (first 3 shelves + favs).
   * Runs once when the visible set stabilises; uses the TanStack query cache
   * so repeat opens are instant. Results flow back via reportNowPlaying.
   */
  const visibleShelves = useMemo(
    () => allShelves.slice(0, visibleShelfCount),
    [allShelves, visibleShelfCount]
  );
  const shelvesForEpg = useDeferredValue(visibleShelves);

  const epgScanKey = useMemo(
    () =>
      [...favoriteStreams, ...shelvesForEpg.flatMap((s) => s.preview)]
        .slice(0, SHELF_EPG_SCAN_MAX)
        .map((c) => c.stream_id)
        .join(","),
    [favoriteStreams, shelvesForEpg]
  );

  useEffect(() => {
    if (!isLiveShelfEpgEnabled()) return;
    if (!reportNowPlaying || shelvesBuilding) return;
    if (visibleShelfCount > 6) return;
    const ids = epgScanKey.split(",").filter(Boolean).map(Number);
    if (!ids.length) return;
    let cancelled = false;
    const nowSec = Math.floor(Date.now() / 1000);

    const bulk = getBulkCachedEpgTitles(creds.server, creds.username, ids);
    for (const [id, title] of bulk) {
      reportNowPlaying(id)(title);
    }

    const known = getCachedEpgKnownIds(creds.server, creds.username, ids);
    const pending = ids.filter((id) => !known.has(id));
    if (!pending.length) return;

    const cacheBatch: Array<{ streamId: number; title: string }> = [];
    void runWithConcurrency(
      pending,
      maxConcurrentEpgFetches(),
      async (id) => {
        try {
          const data = await queryClient.fetchQuery({
            queryKey: [
              "short-epg",
              creds.server,
              creds.username,
              id,
              SHORT_EPG_NOW_PLAYING_LIMIT,
            ],
            queryFn: ({ signal }) =>
              xtream.shortEPG(
                creds,
                id,
                SHORT_EPG_NOW_PLAYING_LIMIT,
                signal
              ),
            staleTime: SHORT_EPG_STALE_MS,
            retry: false,
          });
          if (cancelled) return;
          const listings = data?.epg_listings;
          if (!listings?.length) return;
          const title = nowPlayingTitleFromListings(listings, nowSec);
          if (title) {
            cacheBatch.push({ streamId: id, title });
            reportNowPlaying(id)(title);
          }
        } catch {
          /* network error — skip */
        }
      }
    ).then(() => {
      if (!cancelled && cacheBatch.length > 0) {
        setCachedEpgTitlesBatch(creds.server, creds.username, cacheBatch);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    epgScanKey,
    reportNowPlaying,
    creds,
    queryClient,
    shelvesBuilding,
    visibleShelfCount,
  ]);

  const openCategoryShelfMeta = openCategoryId
    ? allShelves.find((s) => s.id === openCategoryId) ?? null
    : null;

  const openCategoryChannelsRaw = useMemo(() => {
    if (!openCategoryId) return [];
    const raw = materializeLiveCategoryStreams({
      all: serverCounts ? EMPTY_LIVE_STREAMS : deferredStreams,
      categoryId: openCategoryId,
      streamIdsByCategory: shelfIdsByCategory ?? streamIdsByCategory,
      streamById: shelfStreamById ?? catalogStreamById,
      maxItems: LIVE_LIST_MAX_CHANNELS,
      allowedCatIds,
      hideAdult,
      parentalUnlocked,
    });
    const cat = deferredCategories.find(
      (c) => String(c.category_id) === openCategoryId
    );
    if (!cat) return raw;
    return filterStreamsForTvRegion(raw, region, cat.category_name);
  }, [
    openCategoryId,
    serverCounts,
    deferredStreams,
    shelfIdsByCategory,
    streamIdsByCategory,
    shelfStreamById,
    catalogStreamById,
    deferredCategories,
    region,
    allowedCatIds,
    hideAdult,
    parentalUnlocked,
  ]);

  const openCategoryChannels = useDeferredValue(openCategoryChannelsRaw);

  if (loading && streams.length === 0) {
    return (
      <div className="px-4 sm:px-6 py-6 space-y-10">
        <div className="flex gap-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-8 w-28 rounded-full" />
          ))}
        </div>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="space-y-3">
            <div className="skeleton h-5 w-44 rounded-lg" />
            <div className="flex gap-3">
              {Array.from({ length: 6 }).map((_, j) => (
                <div
                  key={j}
                  className="skeleton rounded-2xl flex-shrink-0"
                  style={{ width: 176, height: 140 }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (allShelves.length === 0 && favoriteStreams.length === 0 && !shelvesBuilding) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[55vh] gap-5 text-center px-6">
        <div className="size-16 rounded-2xl bg-(--bg-2) border border-(--line) grid place-items-center">
          <Radio className="size-8 text-(--text-muted)/50" />
        </div>
        <div className="space-y-2">
          <p className="text-lg font-semibold text-(--text)">No channels found</p>
          <p className="text-sm text-(--text-muted)">
            {region !== "All"
              ? `No ${region} channels detected. Try switching to "All" regions.`
              : "Check your IPTV connection or try a different playlist."}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap justify-center">
          {region !== "All" && (
            <button
              type="button"
              data-tv-card-root
              onClick={() => handleRegionChange("All")}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl btn-brand text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50"
            >
              Show all regions
            </button>
          )}
          <Link
            href="/app/search"
            data-tv-card-root
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-(--line) bg-(--bg-2) text-sm font-medium text-(--text-dim) hover:text-(--text) hover:border-(--line-2) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50"
          >
            <Search className="size-4" />
            Search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Category view overlay */}
      {openCategoryShelfMeta && (
        <TvCategoryView
          title={openCategoryShelfMeta.title}
          categoryTitle={openCategoryShelfMeta.title}
          channels={openCategoryChannels}
          nowPlayingMap={nowPlayingMap}
          activeStreamId={current?.id}
          creds={creds}
          onPlay={(c) => {
            openChannel(c);
          }}
          onBack={closeCategory}
        />
      )}

    <div className="px-4 sm:px-6 pt-4 pb-12 space-y-8">
      {/* ── Page header: title + compact region picker ── */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-(--text) tracking-tight">Live TV</h1>
        <RegionPicker region={region} onChange={handleRegionChange} />
      </div>

      <TvSpatialGrid className="space-y-10">
        {/* Favourites shelf — pinned at top */}
        {favoriteStreams.length > 0 && (
          <TvShelf title="❤ Favourites" seeAllHref="/app/favorites">
            {favoriteStreams.map((c) => (
              <MemoChannelCard
                key={c.stream_id}
                name={c.name}
                icon={c.stream_icon}
                panelServer={creds.server}
                nowPlaying={nowPlayingMap.get(c.stream_id)}
                active={current?.id === c.stream_id}
                onClick={() => openChannel(c)}
                warmPlaybackUrl={buildLivePlayUrl(creds, c)}
              />
            ))}
          </TvShelf>
        )}

        {/* Category shelves */}
        <LiveShelfList<LiveShelfMeta>
          items={allShelves}
          visibleCount={visibleShelfCount}
          itemKey={(shelf) => shelf.id}
          renderItem={renderShelfRow}
          footer={
            hasMore ? (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  data-tv-card-root
                  disabled={shelvesBuilding && shelvesReadyToReveal === 0}
                  onClick={loadMoreShelves}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-(--line) bg-(--bg-2) text-sm font-medium text-(--text-dim) hover:text-(--text) hover:border-(--brand)/40 hover:bg-(--bg-3) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55 disabled:opacity-50"
                >
                  {loadingMoreCategories ||
                  (shelvesBuilding && shelvesReadyToReveal === 0)
                    ? "Loading categories…"
                    : shelvesReadyToReveal > 0
                      ? `Show more categories (${shelvesReadyToReveal} ready)`
                      : "Show more categories"}
                </button>
              </div>
            ) : null
          }
        />
      </TvSpatialGrid>
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Compact region picker — single button that opens a dropdown overlay
// ---------------------------------------------------------------------------

function RegionPicker({
  region,
  onChange,
}: {
  region: TvRegion;
  onChange: (r: TvRegion) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click / focus-out
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        data-tv-card-root
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-(--line) bg-(--bg-2) text-sm font-medium text-(--text-dim) hover:text-(--text) hover:border-(--line-2) transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50"
      >
        <span className="truncate max-w-[140px]">{region}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 min-w-[180px] rounded-xl border border-(--line) bg-(--bg-1) shadow-xl shadow-black/40 overflow-hidden">
          {ALL_TV_REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              data-tv-card-root
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
              className={`w-full px-4 py-2.5 text-sm text-left transition-colors focus-visible:outline-none focus-visible:bg-(--bg-2) ${
                region === r
                  ? "bg-(--brand)/15 text-(--text) font-medium"
                  : "text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Memoized channel card (prevents re-renders when nowPlayingMap updates
// for unrelated channels)
// ---------------------------------------------------------------------------

type MemoCardProps = {
  name: string;
  icon?: string;
  panelServer: string;
  nowPlaying?: string;
  active: boolean;
  onClick: () => void;
  warmPlaybackUrl?: string;
};

const MemoChannelCard = memo(function MemoChannelCard({
  name,
  icon,
  panelServer,
  nowPlaying,
  active,
  onClick,
  warmPlaybackUrl,
}: MemoCardProps) {
  return (
    <TvChannelCard
      name={name}
      icon={icon}
      panelServer={panelServer}
      nowPlaying={nowPlaying}
      active={active}
      onClick={onClick}
      onWarmPointer={
        warmPlaybackUrl
          ? () => prefetchLiveStreamManifest(warmPlaybackUrl)
          : undefined
      }
    />
  );
});

