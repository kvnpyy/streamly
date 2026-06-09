"use client";

import { LiveShelfList } from "@/components/LiveShelfList";
import { LiveShelfRow } from "@/components/LiveShelfRow";
import {
  ALL_TV_REGIONS,
  coerceTvRegion,
  detectRegionFromTimezone,
  type TvRegion,
} from "@/lib/geo-continent";
import { filterStreamsForTvRegion } from "@/lib/live-category-shelf";
import type { LiveShelfMeta } from "@/lib/live-category-shelf";
import {
  EMPTY_LIVE_STREAMS,
  hasLiveServerCategoryCounts,
} from "@/lib/live-browse-streams";
import { fetchLiveCategoryChannels } from "@/lib/live-catalog-channels";
import { fetchLiveShelfPreviews } from "@/lib/live-catalog-shelves";
import { WebLiveBrowsePaged } from "@/components/WebLiveBrowsePaged";
import { openLiveShelfChannel } from "@/lib/open-live-shelf-channel";
import { useLiveCategoryShelves } from "@/hooks/use-live-category-shelves";
import { useLiveOpenCategory } from "@/hooks/use-live-open-category";
import { useLiveShelfSearchHits } from "@/hooks/use-live-shelf-search-hits";
import { useQuery } from "@tanstack/react-query";
import type { Category, LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
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

const MAX_PER_SHELF = 6;
const INITIAL_SHELF_COUNT = 3;
/** One shelf row per click keeps DOM growth smooth on large catalogs. */
const SHELF_LOAD_INCREMENT = 1;

const EMPTY_NOW_PLAYING = new Map<number, string>();
const EMPTY_NAME_LOWER = new Map<number, string>();
const EMPTY_STREAM_BY_ID = new Map<number, LiveStream>();

export type WebLiveBrowseProps = {
  categories: Category[];
  streams: LiveStream[];
  creds: XtreamCredentials;
  openChannel: (c: LiveStream) => void;
  nowPlayingMap?: Map<number, string>;
  reportNowPlaying?: (id: number) => (title: string | undefined) => void;
  searchQuery?: string;
  programTitleByStreamId?: Map<number, string>;
  streamIdsByCategory?: Record<string, number[]>;
  countByCategoryId?: Record<string, number>;
  streamById?: Map<number, LiveStream>;
};

function WebLiveBrowseInner(props: WebLiveBrowseProps) {
  const {
    categories,
    streams,
    creds,
    openChannel,
    nowPlayingMap = EMPTY_NOW_PLAYING,
    searchQuery = "",
    programTitleByStreamId,
    streamIdsByCategory,
    countByCategoryId,
    streamById: catalogStreamById,
  } = props;

  const deferredSearch = useDeferredValue(searchQuery);
  const serverCounts = hasLiveServerCategoryCounts(countByCategoryId);
  const onPagedShelfPlay = useCallback(
    (c: import("@/lib/xtream-types").LiveStream, shelf?: LiveShelfMeta) => {
      if (shelf) openLiveShelfChannel(creds, c, shelf);
    },
    [creds]
  );

  if (serverCounts && !deferredSearch) {
    return <WebLiveBrowsePaged creds={creds} openChannel={onPagedShelfPlay} />;
  }

  return <WebLiveBrowseLegacy {...props} />;
}

function WebLiveBrowseLegacy({
  categories,
  streams,
  creds,
  openChannel,
  nowPlayingMap = EMPTY_NOW_PLAYING,
  searchQuery = "",
  programTitleByStreamId,
  streamIdsByCategory,
  countByCategoryId,
  streamById: catalogStreamById,
}: WebLiveBrowseProps) {
  const { current } = usePlayer();

  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const setStoredRegion = usePrefs((s) => s.setTvRegionFilter);
  const hideAdult = usePrefs((s) => s.hideAdult);
  const parentalUnlocked = usePrefs((s) => s.parentalUnlocked);

  const { openCategory, closeCategory } = useLiveOpenCategory();

  useEffect(() => {
    if (storedRegion === null) {
      setStoredRegion(detectRegionFromTimezone());
    }
  }, [storedRegion, setStoredRegion]);

  const region: TvRegion = coerceTvRegion(storedRegion) ?? "All";
  const serverCounts = hasLiveServerCategoryCounts(countByCategoryId);

  const deferredCats = useDeferredValue(categories);
  const allowedCatIds = useMemo(
    () => new Set(deferredCats.map((c) => String(c.category_id))),
    [deferredCats]
  );
  const deferredSearch = useDeferredValue(searchQuery);
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

  const categoryIdsForSearch = useMemo(
    () => deferredCats.map((c) => String(c.category_id)),
    [deferredCats]
  );

  const { searchHitsByCategory: deferredSearchHits } = useLiveShelfSearchHits({
    queryLower: deferredSearch,
    categoryIds: categoryIdsForSearch,
    streamIdsByCategory: streamIdsByCategory ?? null,
    streamById: catalogStreamById ?? EMPTY_STREAM_BY_ID,
    streams: serverCounts ? EMPTY_LIVE_STREAMS : deferredStreams,
    nameLowerById: EMPTY_NAME_LOWER,
    nowPlayingMap,
    programTitleByStreamId,
    maxHitsPerCategory: MAX_PER_SHELF + 1,
    enabled: Boolean(deferredSearch && catalogStreamById),
  });

  const shelfInputsKey = useMemo(() => {
    if (serverCounts) {
      return `${region}|${deferredSearch}|${deferredCats.length}|${deferredCats[0]?.category_id ?? ""}|srv`;
    }
    const n = deferredStreams.length;
    return `${region}|${deferredSearch}|${deferredCats.length}|${deferredCats[0]?.category_id ?? ""}|${n}:${deferredStreams[0]?.stream_id ?? 0}:${deferredStreams[n - 1]?.stream_id ?? 0}`;
  }, [region, deferredSearch, deferredCats, deferredStreams, serverCounts]);

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
    categories: deferredCats,
    streams: deferredStreams,
    region,
    maxPerShelf: MAX_PER_SHELF,
    initialVisible: INITIAL_SHELF_COUNT,
    loadIncrement: SHELF_LOAD_INCREMENT,
    streamIdsByCategory,
    countByCategoryId,
    streamById: catalogStreamById,
    searchHitsByCategory: deferredSearch ? deferredSearchHits : null,
    shelfInputsKey,
    categoriesPerSlice: 4,
    resolveShelfPreviews: serverCounts ? resolveShelfPreviews : undefined,
    resolveStreamsByIds: serverCounts ? undefined : resolveStreamsByIds,
    enabled: true,
  });

  const handleRegionChange = useCallback(
    (r: TvRegion) => {
      closeCategory();
      setStoredRegion(r);
      resetVisible();
    },
    [closeCategory, setStoredRegion, resetVisible]
  );

  const handleOpenCategory = useCallback(
    (shelf: LiveShelfMeta) => {
      openCategory(shelf.id, shelf.title);
    },
    [openCategory]
  );

  const renderShelfRow = useCallback(
    (shelf: LiveShelfMeta) => (
      <LiveShelfRow
        shelf={shelf}
        maxPerShelf={MAX_PER_SHELF}
        creds={creds}
        variant="web"
        activeStreamId={current?.id}
        nowPlayingMap={EMPTY_NOW_PLAYING}
        onSeeAll={() => handleOpenCategory(shelf)}
        onPlay={(stream, shelf) => openLiveShelfChannel(creds, stream, shelf)}
      />
    ),
    [creds, current?.id, handleOpenCategory]
  );

  return (
    <div className="space-y-6 py-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-(--text-dim)">
            <span className="font-medium text-(--text)">{visibleShelfCount}</span>{" "}
            {visibleShelfCount === 1 ? "category" : "categories"} shown
            {allShelves.length > visibleShelfCount ? (
              <span className="text-(--text-muted)">
                {" "}
                · {allShelves.length - visibleShelfCount} ready
              </span>
            ) : null}
            {searchQuery ? (
              <span className="text-(--text-muted)"> matching search</span>
            ) : null}
          </p>
          <WebRegionPicker region={region} onChange={handleRegionChange} />
        </div>

        {searchQuery && allShelves.length === 0 && (
          <div className="card p-8 sm:p-10 text-center">
            <p className="text-sm text-(--text-muted) text-pretty max-w-md mx-auto leading-relaxed">
              No channels match your search in the current region. Try another
              region or clear the search bar above.
            </p>
          </div>
        )}

        <LiveShelfList
          items={allShelves}
          visibleCount={visibleShelfCount}
          itemKey={(shelf) => shelf.id}
          renderItem={renderShelfRow}
          footer={
            hasMore ? (
              <div className="flex justify-center py-2">
                <button
                  type="button"
                  disabled={shelvesBuilding && shelvesReadyToReveal === 0}
                  onClick={loadMoreShelves}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-(--line) bg-(--bg-2) text-sm font-medium text-(--text-dim) hover:text-(--text) hover:border-(--brand)/40 hover:bg-(--bg-3) transition-colors disabled:opacity-50"
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
  );
}

function webLiveBrowsePropsAreEqual(
  prev: WebLiveBrowseProps,
  next: WebLiveBrowseProps
): boolean {
  if (prev.categories !== next.categories) return false;
  if (prev.streams !== next.streams) return false;
  if (prev.streamById !== next.streamById) return false;
  if (prev.streamIdsByCategory !== next.streamIdsByCategory) return false;
  if (prev.countByCategoryId !== next.countByCategoryId) return false;
  if (prev.creds !== next.creds) return false;
  if (prev.openChannel !== next.openChannel) return false;
  if (prev.searchQuery !== next.searchQuery) return false;
  if (prev.programTitleByStreamId !== next.programTitleByStreamId) return false;
  if (prev.searchQuery && prev.nowPlayingMap !== next.nowPlayingMap) return false;
  return true;
}

export const WebLiveBrowse = memo(WebLiveBrowseInner, webLiveBrowsePropsAreEqual);

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
