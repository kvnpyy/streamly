"use client";

import { LiveShelfList } from "@/components/LiveShelfList";
import { LiveShelfRow } from "@/components/LiveShelfRow";
import {
  ALL_TV_REGIONS,
  detectRegionFromTimezone,
  type TvRegion,
} from "@/lib/geo-continent";
import type { LiveShelfMeta } from "@/lib/live-category-shelf";
import { useLiveOpenCategory } from "@/hooks/use-live-open-category";
import { useLiveShelfBrowse } from "@/hooks/use-live-shelf-browse";
import { useShelfNowPlayingMap } from "@/hooks/use-shelf-now-playing";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { ChevronDown } from "lucide-react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const MAX_PER_SHELF = 6;
const INITIAL_SHELF_COUNT = 8;
const SHELF_LOAD_INCREMENT = 8;

export type WebLiveBrowsePagedProps = {
  creds: XtreamCredentials;
  openChannel: (
    c: import("@/lib/xtream-types").LiveStream,
    shelf?: LiveShelfMeta
  ) => void;
};

function WebLiveBrowsePagedInner({ creds, openChannel }: WebLiveBrowsePagedProps) {
  const activeStreamId = usePlayer((s) => s.current?.id);
  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const setStoredRegion = usePrefs((s) => s.setTvRegionFilter);
  const { openCategory, closeCategory } = useLiveOpenCategory();

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
    totalCategoriesInRegion,
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

  const shelfEpgChannels = useMemo(
    () =>
      allShelves
        .slice(0, visibleShelfCount)
        .flatMap((s) => s.preview),
    [allShelves, visibleShelfCount]
  );

  const categoryNameById = useMemo(() => {
    const out: Record<string, string> = {};
    for (const shelf of allShelves.slice(0, visibleShelfCount)) {
      for (const c of shelf.preview) {
        out[c.category_id] = shelf.title;
      }
    }
    return out;
  }, [allShelves, visibleShelfCount]);

  const shelfNowPlayingMap = useShelfNowPlayingMap(
    creds,
    shelfEpgChannels,
    categoryNameById,
    shelfEpgChannels.length > 0
  );

  const renderShelfRow = useCallback(
    (shelf: LiveShelfMeta) => (
      <LiveShelfRow
        shelf={shelf}
        maxPerShelf={MAX_PER_SHELF}
        creds={creds}
        variant="web"
        activeStreamId={activeStreamId}
        nowPlayingMap={shelfNowPlayingMap}
        onSeeAll={() => handleOpenCategory(shelf)}
        onPlay={openChannel}
      />
    ),
    [creds, activeStreamId, openChannel, handleOpenCategory, shelfNowPlayingMap]
  );

  const onLoadMore = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      loadMoreShelves();
    },
    [loadMoreShelves]
  );

  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hasMore || shelvesBuilding) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMoreShelves();
      },
      { rootMargin: "280px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, shelvesBuilding, loadMoreShelves]);

  return (
    <div className="space-y-6 py-2">
        <div className="flex items-center justify-between">
          <p className="text-sm text-(--text-dim)">
            <span className="font-medium text-(--text)">{visibleShelfCount}</span>{" "}
            {visibleShelfCount === 1 ? "category" : "categories"} shown
            {totalCategoriesInRegion != null ? (
              <span className="text-(--text-muted)">
                {" "}
                · {totalCategoriesInRegion} in{" "}
                {region === "All" ? "all regions" : region}
              </span>
            ) : null}
            {allShelves.length > visibleShelfCount ? (
              <span className="text-(--text-muted)">
                {" "}
                · {allShelves.length - visibleShelfCount} ready
              </span>
            ) : null}
          </p>
          <WebRegionPicker region={region} onChange={handleRegionChange} />
        </div>

        <LiveShelfList
          items={allShelves}
          visibleCount={visibleShelfCount}
          itemKey={(shelf) => shelf.id}
          renderItem={renderShelfRow}
          footer={
            hasMore ? (
              <div ref={loadMoreSentinelRef} className="flex justify-center py-2">
                <button
                  type="button"
                  disabled={shelvesBuilding && shelvesReadyToReveal === 0}
                  onClick={onLoadMore}
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

export const WebLiveBrowsePaged = memo(WebLiveBrowsePagedInner);

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
