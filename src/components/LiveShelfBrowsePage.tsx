"use client";

import { WebLiveBrowsePaged } from "@/components/WebLiveBrowsePaged";
import { LiveShelfNameSearch } from "@/components/LiveShelfNameSearch";
import { LiveCategoryBrowseModal } from "@/components/LiveCategoryBrowseModal";
import { LiveChannelSearchField } from "@/components/LiveChannelSearchField";
import { LiveMediaCard } from "@/components/LiveMediaCard";
import { SectionHeader } from "@/components/SectionHeader";
import {
  buildLiveFlipPlaylist,
  liveStreamToPlayerSource,
} from "@/lib/live-flip-playlist";
import { catalogKeys } from "@/lib/catalog-queries";
import {
  fetchLiveCategoryChannels,
} from "@/lib/live-catalog-channels";
import type { SlimLiveCatalog } from "@/lib/slim-live-catalog";
import { buildLivePlayUrl } from "@/lib/xtream";
import type { Category, LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { Layers } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

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
  const [categoryBrowseOpen, setCategoryBrowseOpen] = useState(false);

  const toSource = useCallback(
    (c: LiveStream) => liveStreamToPlayerSource(creds, c),
    [creds]
  );

  const shelfOpenChannel = useCallback(
    (c: LiveStream) => {
      play(toSource(c), {
        playlist: buildLiveFlipPlaylist(creds, [c]),
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
    [play, addRecent, toSource, creds]
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
    enabled: recentLiveIds.length > 0 && catalog.isFetched,
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
        <ViewToggle
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
        className={tvLivingRoom ? "flex flex-1" : "hidden lg:flex"}
      />
    </div>
  );

  return (
    <div className="space-y-5">
      <SectionHeader
        hideDescriptionOnMobile
        eyebrow="Watch live"
        title="Live TV"
        description="Browse channels by category. Click any channel to start streaming instantly."
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
                  onClick={() => shelfOpenChannel(stream)}
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
      ) : catalog.isFetched && !catalog.isError ? (
        <WebLiveBrowsePaged creds={creds} openChannel={shelfOpenChannel} />
      ) : null}
    </div>
  );
}

function ViewToggle({
  view,
  setView,
  pending,
}: {
  view: ViewMode;
  setView: (v: ViewMode) => void;
  pending: boolean;
}) {
  return (
    <div
      className="flex rounded-xl border border-(--line) bg-(--bg-2) p-0.5 shrink-0"
      aria-busy={pending || undefined}
    >
      <button
        type="button"
        onClick={() => setView("list")}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          view === "list"
            ? "bg-(--brand) text-white"
            : "text-(--text-dim) hover:text-(--text)"
        }`}
      >
        List
      </button>
      <button
        type="button"
        onClick={() => setView("guide")}
        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
          view === "guide"
            ? "bg-(--brand) text-white"
            : "text-(--text-dim) hover:text-(--text)"
        }`}
      >
        Guide
      </button>
    </div>
  );
}
