"use client";

import { TvCategoryView } from "@/components/TvCategoryView";
import { TvChannelCard } from "@/components/TvChannelCard";
import { TvShelf } from "@/components/TvShelf";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import {
  ALL_TV_REGIONS,
  detectRegionFromTimezone,
  getCategoryRegion,
  type TvRegion,
} from "@/lib/geo-continent";
import {
  getCachedEpgTitle,
  setCachedEpgTitle,
} from "@/lib/epg-local-cache";
import { nowPlayingTitleFromListings, SHORT_EPG_STALE_MS } from "@/lib/hooks";
import { xtream } from "@/lib/xtream";
import type { Category, LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { usePlayer } from "@/store/player";
import type { Favorite } from "@/store/preferences";
import { usePrefs } from "@/store/preferences";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Radio, Search } from "lucide-react";
import Link from "next/link";
import { memo, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";

/** Channels shown per shelf. */
// 5 cards per shelf: with wider cards (~220px) at 1280px viewport width, ~5 are
// fully visible and the OverflowCard is always partially visible at the right edge,
// giving users a clear affordance that more channels exist in that category.
const MAX_PER_SHELF = 5;
/** Shelves rendered on first paint — keep very low for TV browser speed. */
const INITIAL_SHELF_COUNT = 3;
const SHELF_LOAD_INCREMENT = 3;

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
};

export function TvLiveBrowse({
  categories,
  streams,
  loading,
  creds,
  openChannel,
  favorites,
  nowPlayingMap,
  reportNowPlaying,
}: TvLiveBrowseProps) {
  const { current } = usePlayer();
  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const setStoredRegion = usePrefs((s) => s.setTvRegionFilter);
  const queryClient = useQueryClient();

  const [visibleShelfCount, setVisibleShelfCount] = useState(INITIAL_SHELF_COUNT);
  /** null = main browse; string = category id of the open category view overlay */
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  // Auto-detect region on first visit (storedRegion === null)
  useEffect(() => {
    if (storedRegion === null) {
      const detected = detectRegionFromTimezone();
      setStoredRegion(detected);
    }
  }, [storedRegion, setStoredRegion]);

  // The active region — use "All" while auto-detecting to avoid flash
  const region: TvRegion = storedRegion ?? "All";

  const handleRegionChange = useCallback(
    (r: TvRegion) => {
      setStoredRegion(r);
      setVisibleShelfCount(INITIAL_SHELF_COUNT);
    },
    [setStoredRegion]
  );

  /**
   * Defer the heavy 10K-stream computation so the first paint (skeleton →
   * region bar) is never blocked by processing a large array.
   */
  const deferredStreams = useDeferredValue(streams);
  const deferredCategories = useDeferredValue(categories);

  const streamsByCategory = useMemo(() => {
    const map = new Map<string, LiveStream[]>();
    for (const s of deferredStreams) {
      const cid = String(s.category_id);
      if (!map.has(cid)) map.set(cid, []);
      map.get(cid)!.push(s);
    }
    return map;
  }, [deferredStreams]);

  /**
   * Two-level region filter:
   *
   * 1. Category has a detectable country prefix (e.g. "UK | Sports"):
   *    → hide the entire shelf if the prefix doesn't match the active region.
   *
   * 2. Category has NO country prefix (e.g. "Sports", "Entertainment"):
   *    → keep the shelf but filter its individual channels by their own name.
   *    This catches channels like "UK: Sky Sports" inside a generic category.
   *    Channels with no name prefix are always shown (truly generic, e.g. "Eurosport").
   */
  const activeShelves = useMemo(() => {
    const result: { id: string; title: string; channels: LiveStream[] }[] = [];

    for (const c of deferredCategories) {
      const allChannels = streamsByCategory.get(String(c.category_id));
      if (!allChannels?.length) continue;

      const catRegion = getCategoryRegion(c.category_name);

      let channels: LiveStream[];
      if (region === "All") {
        channels = allChannels;
      } else if (catRegion !== null) {
        // Known country prefix — skip entire shelf if region doesn't match
        if (catRegion !== region) continue;
        channels = allChannels;
      } else {
        // Generic category — filter individual channels by their stream name
        channels = allChannels.filter((ch) => {
          const chRegion = getCategoryRegion(ch.name);
          return chRegion === null || chRegion === region;
        });
      }

      if (channels.length === 0) continue;
      result.push({ id: String(c.category_id), title: c.category_name, channels });
    }
    return result;
  }, [deferredCategories, streamsByCategory, region]);

  /** Favourite live channels — pinned shelf at the top. */
  const favoriteStreams = useMemo(() => {
    const favSet = new Set(
      favorites.filter((f) => f.kind === "live").map((f) => f.id)
    );
    return streams.filter((s) => favSet.has(s.stream_id)).slice(0, MAX_PER_SHELF);
  }, [favorites, streams]);

  /** Shelves actually rendered (pagination). */
  const renderedShelves = activeShelves.slice(0, visibleShelfCount);
  const hasMore = activeShelves.length > visibleShelfCount;

  /**
   * Scan short EPG for the currently visible channels (first 3 shelves + favs).
   * Runs once when the visible set stabilises; uses the TanStack query cache
   * so repeat opens are instant. Results flow back via reportNowPlaying.
   */
  const epgScanKey = useMemo(
    () =>
      [...favoriteStreams, ...renderedShelves.flatMap((s) => s.channels)]
        .slice(0, 32)
        .map((c) => c.stream_id)
        .join(","),
    [favoriteStreams, renderedShelves]
  );

  useEffect(() => {
    if (!reportNowPlaying) return;
    const ids = epgScanKey.split(",").filter(Boolean).map(Number);
    if (!ids.length) return;
    let cancelled = false;
    const nowSec = Math.floor(Date.now() / 1000);

    // Pre-populate from localStorage cache — zero API calls for cached entries.
    for (const id of ids) {
      const cached = getCachedEpgTitle(creds.server, creds.username, id);
      if (cached) reportNowPlaying(id)(cached);
    }

    void Promise.all(
      ids.map(async (id) => {
        // Skip if localStorage already had a fresh title for this id.
        if (getCachedEpgTitle(creds.server, creds.username, id)) return;
        try {
          const data = await queryClient.fetchQuery({
            queryKey: ["short-epg", creds.server, creds.username, id, 2],
            queryFn: ({ signal }) => xtream.shortEPG(creds, id, 2, signal),
            staleTime: SHORT_EPG_STALE_MS,
          });
          if (cancelled) return;
          const listings = data?.epg_listings;
          if (!listings?.length) return;
          const title = nowPlayingTitleFromListings(listings, nowSec);
          if (title) {
            setCachedEpgTitle(creds.server, creds.username, id, title);
            reportNowPlaying(id)(title);
          }
        } catch {
          /* network error — skip */
        }
      })
    );
    return () => {
      cancelled = true;
    };
  }, [epgScanKey, reportNowPlaying, creds, queryClient]);

  if (loading) {
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

  if (activeShelves.length === 0 && favoriteStreams.length === 0) {
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

  // The open category shelf (for the full-screen overlay)
  const openCategoryShelf = openCategoryId
    ? activeShelves.find((s) => s.id === openCategoryId) ?? null
    : null;

  return (
    <>
      {/* Category view overlay */}
      {openCategoryShelf && (
        <TvCategoryView
          title={openCategoryShelf.title}
          channels={openCategoryShelf.channels}
          nowPlayingMap={nowPlayingMap}
          activeStreamId={current?.id}
          creds={creds}
          onPlay={(c) => {
            openChannel(c);
            setOpenCategoryId(null);
          }}
          onBack={() => setOpenCategoryId(null)}
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
                nowPlaying={nowPlayingMap.get(c.stream_id)}
                active={current?.id === c.stream_id}
                onClick={() => openChannel(c)}
              />
            ))}
          </TvShelf>
        )}

        {/* Category shelves — paginated */}
        {renderedShelves.map((shelf) => (
          <TvShelf
            key={shelf.id}
            title={shelf.title}
            onSeeAll={() => setOpenCategoryId(shelf.id)}
            moreCount={
              shelf.channels.length > MAX_PER_SHELF
                ? shelf.channels.length - MAX_PER_SHELF
                : undefined
            }
          >
            {shelf.channels.slice(0, MAX_PER_SHELF).map((c) => (
              <MemoChannelCard
                key={c.stream_id}
                name={c.name}
                icon={c.stream_icon}
                nowPlaying={nowPlayingMap.get(c.stream_id)}
                active={current?.id === c.stream_id}
                onClick={() => openChannel(c)}
              />
            ))}
          </TvShelf>
        ))}

        {/* Load-more button */}
        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              data-tv-card-root
              onClick={() =>
                setVisibleShelfCount((n) => n + SHELF_LOAD_INCREMENT)
              }
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-(--line) bg-(--bg-2) text-sm font-medium text-(--text-dim) hover:text-(--text) hover:border-(--brand)/40 hover:bg-(--bg-3) transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55"
            >
              Show more categories ({activeShelves.length - visibleShelfCount}{" "}
              remaining)
            </button>
          </div>
        )}
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
  nowPlaying?: string;
  active: boolean;
  onClick: () => void;
};

const MemoChannelCard = memo(function MemoChannelCard({
  name,
  icon,
  nowPlaying,
  active,
  onClick,
}: MemoCardProps) {
  return (
    <TvChannelCard
      name={name}
      icon={icon}
      nowPlaying={nowPlaying}
      active={active}
      onClick={onClick}
    />
  );
});

