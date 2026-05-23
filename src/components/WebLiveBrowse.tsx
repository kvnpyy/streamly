"use client";

import { TvCategoryView } from "@/components/TvCategoryView";
import { TvChannelCard } from "@/components/TvChannelCard";
import { TvShelf } from "@/components/TvShelf";
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
import { usePrefs } from "@/store/preferences";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import {
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const MAX_PER_SHELF = 8;
const INITIAL_SHELF_COUNT = 5;
const SHELF_LOAD_INCREMENT = 5;

export type WebLiveBrowseProps = {
  categories: Category[];
  streams: LiveStream[];
  creds: XtreamCredentials;
  openChannel: (c: LiveStream) => void;
  nowPlayingMap: Map<number, string>;
  reportNowPlaying?: (id: number) => (title: string | undefined) => void;
};

/**
 * Netflix-style horizontal shelf browsing for desktop + mobile browsers.
 * Brings the same experience as TvLiveBrowse to non-TV users:
 *  - Categories grouped into horizontal shelves
 *  - Region filter auto-detected from timezone (shared with TV pref)
 *  - "See all" overlay for deep category browsing
 *  - EPG pre-scan for visible channels
 */
export function WebLiveBrowse({
  categories,
  streams,
  creds,
  openChannel,
  nowPlayingMap,
  reportNowPlaying,
}: WebLiveBrowseProps) {
  const { current } = usePlayer();
  const queryClient = useQueryClient();

  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const setStoredRegion = usePrefs((s) => s.setTvRegionFilter);

  const [visibleShelfCount, setVisibleShelfCount] = useState(INITIAL_SHELF_COUNT);
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  // Auto-detect region on first visit (storedRegion === null)
  useEffect(() => {
    if (storedRegion === null) {
      setStoredRegion(detectRegionFromTimezone());
    }
  }, [storedRegion, setStoredRegion]);

  const region: TvRegion = storedRegion ?? "All";

  const handleRegionChange = useCallback(
    (r: TvRegion) => {
      setStoredRegion(r);
      setVisibleShelfCount(INITIAL_SHELF_COUNT);
    },
    [setStoredRegion]
  );

  const deferredStreams = useDeferredValue(streams);
  const deferredCats = useDeferredValue(categories);

  // Build per-category stream index
  const streamsByCategory = useMemo(() => {
    const map = new Map<string, LiveStream[]>();
    for (const s of deferredStreams) {
      const id = String(s.category_id);
      if (!map.has(id)) map.set(id, []);
      map.get(id)!.push(s);
    }
    return map;
  }, [deferredStreams]);

  /**
   * Two-level region filter (identical to TvLiveBrowse):
   *  1. Category with a country prefix → hide shelf if prefix ≠ region
   *  2. Generic category (no prefix) → filter individual channels by their name
   */
  const allShelves = useMemo(() => {
    const result: { id: string; title: string; channels: LiveStream[] }[] = [];

    for (const c of deferredCats) {
      const allCh = streamsByCategory.get(String(c.category_id));
      if (!allCh?.length) continue;

      const catRegion = getCategoryRegion(c.category_name);

      let channels: LiveStream[];
      if (region === "All") {
        channels = allCh;
      } else if (catRegion !== null) {
        if (catRegion !== region) continue;
        channels = allCh;
      } else {
        channels = allCh.filter((ch) => {
          const chRegion = getCategoryRegion(ch.name);
          return chRegion === null || chRegion === region;
        });
      }

      if (channels.length === 0) continue;
      result.push({ id: String(c.category_id), title: c.category_name, channels });
    }
    return result;
  }, [deferredCats, streamsByCategory, region]);

  const renderedShelves = allShelves.slice(0, visibleShelfCount);
  const hasMore = visibleShelfCount < allShelves.length;

  // EPG pre-scan for visible channels
  const epgScanKey = useMemo(
    () =>
      renderedShelves
        .flatMap((s) => s.channels)
        .slice(0, 32)
        .map((c) => c.stream_id)
        .join(","),
    [renderedShelves]
  );

  useEffect(() => {
    if (!reportNowPlaying) return;
    const ids = epgScanKey.split(",").filter(Boolean).map(Number);
    if (!ids.length) return;
    let cancelled = false;
    const nowSec = Math.floor(Date.now() / 1000);

    // Pre-populate from localStorage cache immediately.
    for (const id of ids) {
      const cached = getCachedEpgTitle(creds.server, creds.username, id);
      if (cached) reportNowPlaying(id)(cached);
    }

    void Promise.all(
      ids.map(async (id) => {
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
    return () => { cancelled = true; };
  }, [epgScanKey, reportNowPlaying, creds, queryClient]);

  const openCategoryShelf = openCategoryId
    ? allShelves.find((s) => s.id === openCategoryId) ?? null
    : null;

  const handleOpenCategory = useCallback(
    (id: string) => setOpenCategoryId(id),
    []
  );
  const handleCloseCategory = useCallback(() => setOpenCategoryId(null), []);

  return (
    <>
      {/* Full-screen category overlay */}
      {openCategoryShelf && (
        <TvCategoryView
          title={openCategoryShelf.title}
          channels={openCategoryShelf.channels}
          nowPlayingMap={nowPlayingMap}
          activeStreamId={current?.id}
          creds={creds}
          onPlay={(c) => {
            openChannel(c);
            handleCloseCategory();
          }}
          onBack={handleCloseCategory}
        />
      )}

      <div className="space-y-6 py-2">
        {/* Region picker bar */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-(--text-dim)">
            <span className="font-medium text-(--text)">{allShelves.length}</span>{" "}
            {allShelves.length === 1 ? "category" : "categories"} in view
          </p>
          <WebRegionPicker region={region} onChange={handleRegionChange} />
        </div>

        {/* Shelves */}
        {renderedShelves.map((shelf) => (
          <TvShelf
            key={shelf.id}
            title={shelf.title}
            onSeeAll={() => handleOpenCategory(shelf.id)}
            moreCount={
              shelf.channels.length > MAX_PER_SHELF
                ? shelf.channels.length - MAX_PER_SHELF
                : undefined
            }
          >
            {shelf.channels.slice(0, MAX_PER_SHELF).map((c) => (
              <MemoCard
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

        {hasMore && (
          <div className="flex justify-center py-2">
            <button
              type="button"
              onClick={() =>
                setVisibleShelfCount((n) => n + SHELF_LOAD_INCREMENT)
              }
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-(--line) bg-(--bg-2) text-sm font-medium text-(--text-dim) hover:text-(--text) hover:border-(--brand)/40 hover:bg-(--bg-3) transition-colors"
            >
              Show more categories ({allShelves.length - visibleShelfCount}{" "}
              remaining)
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Region picker — compact dropdown for web, consistent with TV version
// ---------------------------------------------------------------------------

function WebRegionPicker({
  region,
  onChange,
}: {
  region: TvRegion;
  onChange: (r: TvRegion) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-(--line) bg-(--bg-2) text-sm font-medium text-(--text-dim) hover:text-(--text) hover:border-(--line-2) transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50"
      >
        <span className="truncate max-w-[160px]">
          {region === "All" ? "All regions" : region}
        </span>
        <ChevronDown
          className={`size-3.5 shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 min-w-[200px] rounded-xl border border-(--line) bg-(--bg-1) shadow-xl shadow-black/30 overflow-hidden">
          {ALL_TV_REGIONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => { onChange(r); setOpen(false); }}
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
// Memoized compact card
// ---------------------------------------------------------------------------

type MemoCardProps = {
  name: string;
  icon?: string;
  nowPlaying?: string;
  active: boolean;
  onClick: () => void;
};

const MemoCard = memo(function MemoCard({
  name,
  icon,
  nowPlaying,
  active,
  onClick,
}: MemoCardProps) {
  return (
    <TvChannelCard
      variant="web"
      name={name}
      icon={icon}
      nowPlaying={nowPlaying}
      active={active}
      onClick={onClick}
    />
  );
});
