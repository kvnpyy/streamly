"use client";

import { LiveGuidePanel } from "@/components/live/LiveGuidePanel";
import { LiveTrendingOnTvBlock } from "@/components/live/LiveTrendingOnTvBlock";
import { TvFocusRoot } from "@/components/tv/TvFocusRoot";
import { WebLiveBrowsePaged } from "@/components/WebLiveBrowsePaged";
import { SkeletonGrid } from "@/components/SectionHeader";
import { LiveShelfNameSearch } from "@/components/LiveShelfNameSearch";
import { LiveCategoryBrowseModal } from "@/components/LiveCategoryBrowseModal";
import { LiveChannelSearchField } from "@/components/LiveChannelSearchField";
import { LiveMediaCard } from "@/components/LiveMediaCard";
import { SectionHeader } from "@/components/SectionHeader";
import { liveStreamToPlayerSource } from "@/lib/live-flip-playlist";
import { openLiveShelfChannel } from "@/lib/open-live-shelf-channel";
import type { LiveShelfMeta } from "@/lib/live-category-shelf";
import { catalogKeys } from "@/lib/catalog-queries";
import { prefetchLiveGuideChunk } from "@/lib/guide-chunk-prefetch";
import {
  fetchLiveCategoryChannels,
  liveCategoryChannelsQueryOptions,
} from "@/lib/live-catalog-channels";
import { LIVE_GUIDE_MAX_CHANNELS } from "@/lib/live-guide-limits";
import { scheduleLiveBrowseUiReady } from "@/lib/live-page-performance";
import type { SlimLiveCatalog } from "@/lib/slim-live-catalog";
import {
  coerceTvRegion,
  detectRegionFromTimezone,
  type TvRegion,
} from "@/lib/geo-continent";
import { buildLivePlayUrl } from "@/lib/xtream";
import { buildLiveRecentStreams } from "@/lib/live-recent-streams";
import { useContinueRecentPlay } from "@/hooks/use-continue-recent-play";
import type { Category, LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Layers, CalendarDays, LayoutList } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type ViewMode = "list" | "guide";

export type LiveShelfBrowsePageProps = {
  creds: XtreamCredentials;
  accountKey: string;
  catalog: UseQueryResult<SlimLiveCatalog, Error>;
  sortedFilteredCats: Category[];
  countById: Record<string, number>;
  categoryNameById: Record<string, string>;
  selected: string | "all";
  setCategory: (v: string | "all") => void;
  view: ViewMode;
  setViewMode: (v: ViewMode) => void;
  viewSwitchPending: boolean;
  q: string;
  setQ: (v: string) => void;
  clearLiveSearch: () => void;
  qTrim: string;
  qLower: string;
  tvLivingRoom: boolean;
  liveSearchRef: React.RefObject<HTMLInputElement | null>;
};

/**
 * Isolated Live TV "all categories" shelf view — does not run grid EPG, programme
 * search, or per-category channel list hooks from the main live page.
 */
export function LiveShelfBrowsePage({
  creds,
  catalog,
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
  tvLivingRoom,
  liveSearchRef,
}: LiveShelfBrowsePageProps) {
  const { play } = usePlayer();
  const isFavorite = usePrefs((s) => s.isFavorite);
  const toggleFavorite = usePrefs((s) => s.toggleFavorite);
  const addRecent = usePrefs((s) => s.addRecent);
  const recents = usePrefs((s) => s.recents);
  const favorites = usePrefs((s) => s.favorites);
  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const [categoryBrowseOpen, setCategoryBrowseOpen] = useState(false);
  const [guideReady, setGuideReady] = useState(false);


  const tvRegion: TvRegion =
    coerceTvRegion(storedRegion) ?? detectRegionFromTimezone();

  useEffect(() => {
    if (view !== "guide") {
      queueMicrotask(() => setGuideReady(false));
      return;
    }
    return scheduleLiveBrowseUiReady(() => setGuideReady(true), 400);
  }, [view]);

  const guideChannelsQuery = useQuery(
    liveCategoryChannelsQueryOptions(
      creds,
      "all",
      LIVE_GUIDE_MAX_CHANNELS,
      view === "guide" && catalog.isFetched && !catalog.isError,
      tvRegion
    )
  );
  const guideChannels = guideChannelsQuery.data ?? [];

  const guidePlayChannel = useCallback(
    (c: LiveStream) => {
      play(liveStreamToPlayerSource(creds, c));
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
    [addRecent, creds, play]
  );

  const shelfOpenChannel = useCallback(
    (c: LiveStream, shelf?: LiveShelfMeta) => {
      if (!shelf) return;
      openLiveShelfChannel(creds, c, shelf);
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
    [addRecent, creds]
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
    enabled: recentLiveIds.length > 0,
    staleTime: 60_000,
    retry: 2,
    structuralSharing: false,
  });

  const liveRecentStreams = useMemo(
    () => buildLiveRecentStreams(recents, recentStreamsQuery.data),
    [recents, recentStreamsQuery.data]
  );

  const { playRecent: playLiveRecent } = useContinueRecentPlay(
    creds,
    recents,
    play,
    addRecent
  );

  const liveSearchToolbar = (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full lg:w-auto">
      <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
        <button
          type="button"
          onClick={() => setCategoryBrowseOpen(true)}
          className={`inline-flex items-center justify-center gap-1.5 min-h-11 px-3 rounded-xl border border-(--line) bg-(--bg-2) text-xs font-medium text-(--text-dim) hover:text-(--text) hover:border-(--brand)/40 shrink-0 ${
            tvLivingRoom ? "" : "lg:hidden"
          }`}
          data-tv-card-root={tvLivingRoom ? true : undefined}
          aria-label="Open category browser"
        >
          <Layers className="size-3.5" aria-hidden />
          Categories
        </button>
        <ViewToggle
          view={view}
          setView={setViewMode}
          pending={viewSwitchPending}
          tvLivingRoom={tvLivingRoom}
        />
      </div>
      <LiveChannelSearchField
        ref={liveSearchRef}
        value={q}
        onValueChange={setQ}
        onClear={q ? clearLiveSearch : undefined}
        className={tvLivingRoom ? "flex flex-1" : "hidden lg:flex"}
      />
    </div>
  );

  return (
    <TvFocusRoot className={tvLivingRoom ? "tv-live-browse" : undefined}>
    <div className={tvLivingRoom ? "space-y-4 flex-1 flex flex-col min-h-0" : "space-y-5"}>
      <SectionHeader
        hideDescriptionOnMobile
        compact={tvLivingRoom}
        className={tvLivingRoom ? "tv-live-browse__header shrink-0" : undefined}
        eyebrow="Watch live"
        title="Live TV"
        description={
          view === "guide"
            ? "TV guide with what’s on now and coming up."
            : "Browse channels by category — pick a row or open the full guide."
        }
        right={liveSearchToolbar}
      />
      <LiveCategoryBrowseModal
        open={categoryBrowseOpen}
        onClose={() => setCategoryBrowseOpen(false)}
        categories={sortedFilteredCats}
        value={selected}
        countById={countById}
        onChange={setCategory}
      />
      {liveRecentStreams.length > 0 && (
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
                  warmPlaybackUrl={buildLivePlayUrl(creds, stream)}
                  title={recent.name}
                  poster={recent.icon}
                  posterFit="contain"
                  badge="Live"
                  onClick={() => playLiveRecent(recent)}
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
      {!qTrim && catalog.isFetched && !catalog.isError && (
        <LiveTrendingOnTvBlock
          creds={creds}
          tvRegion={tvRegion}
          recents={recents}
          favorites={favorites}
          onRecent={(stream) =>
            addRecent({
              kind: "live",
              id: stream.stream_id,
              name: stream.name,
              icon: stream.stream_icon,
              ...(stream.direct_source?.trim()
                ? { meta: { direct_source: stream.direct_source.trim() } }
                : {}),
            })
          }
          isFavorite={(id) => isFavorite("live", id)}
          onToggleFavorite={(c) =>
            toggleFavorite({
              kind: "live",
              id: c.stream_id,
              name: c.name,
              icon: c.stream_icon,
            })
          }
        />
      )}
      {qTrim ? (
        <LiveShelfNameSearch
          creds={creds}
          qLower={qLower}
          categoryNameById={categoryNameById}
          openChannel={shelfOpenChannel}
          isFavorite={(id) => isFavorite("live", id)}
          onToggleFavorite={(c) =>
            toggleFavorite({
              kind: "live",
              id: c.stream_id,
              name: c.name,
              icon: c.stream_icon,
            })
          }
        />
      ) : view === "guide" ? (
        guideChannelsQuery.isLoading && guideChannels.length === 0 ? (
          <SkeletonGrid variant="tile" count={6} />
        ) : guideReady ? (
          <LiveGuidePanel
            channels={guideChannels}
            allCategoriesMode
            categoryNameById={categoryNameById}
            isFavorite={(id) => isFavorite("live", id)}
            onToggleFavorite={(c) =>
              toggleFavorite({
                kind: "live",
                id: c.stream_id,
                name: c.name,
                icon: c.stream_icon,
              })
            }
            onPlay={guidePlayChannel}
            livingRoomGuide={tvLivingRoom}
          />
        ) : (
          <SkeletonGrid variant="tile" count={6} />
        )
      ) : catalog.isFetched && !catalog.isError ? (
        <WebLiveBrowsePaged
          creds={creds}
          openChannel={shelfOpenChannel}
          tvLivingRoom={tvLivingRoom}
        />
      ) : !catalog.isError ? (
        <SkeletonGrid variant="tile" count={4} />
      ) : null}
    </div>
    </TvFocusRoot>
  );
}

function ViewToggle({
  view,
  setView,
  pending,
  tvLivingRoom = false,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  pending: boolean;
  tvLivingRoom?: boolean;
}) {
  const items = [
    {
      value: "list" as const,
      label: tvLivingRoom ? "Browse" : "List",
      icon: <LayoutList className="size-3.5" aria-hidden />,
    },
    {
      value: "guide" as const,
      label: tvLivingRoom ? "TV Guide" : "Guide",
      icon: <CalendarDays className="size-3.5" aria-hidden />,
    },
  ];

  return (
    <div
      className={`flex rounded-xl border border-(--line) bg-(--bg-2) p-0.5 shrink-0 ${
        tvLivingRoom ? "tv-live-view-toggle" : ""
      }`}
      role="group"
      aria-label="Live layout"
      aria-busy={pending || undefined}
    >
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          data-tv-card-root={tvLivingRoom ? true : undefined}
          disabled={pending}
          onPointerEnter={
            item.value === "guide" ? prefetchLiveGuideChunk : undefined
          }
          onFocus={item.value === "guide" ? prefetchLiveGuideChunk : undefined}
          onClick={() => setView(item.value)}
          className={`flex items-center gap-1.5 rounded-lg font-medium transition-colors ${
            tvLivingRoom ? "min-h-11 px-4 text-sm" : "px-3 py-1.5 text-xs"
          } ${
            view === item.value
              ? "bg-(--brand) text-white"
              : "text-(--text-dim) hover:text-(--text)"
          }`}
          aria-pressed={view === item.value}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
    </div>
  );
}
