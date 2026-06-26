"use client";

import { LiveShelfList } from "@/components/LiveShelfList";
import { LiveShelfRow } from "@/components/LiveShelfRow";
import {
  ALL_TV_REGIONS,
  coerceTvRegion,
  detectRegionFromTimezone,
  type TvRegion,
} from "@/lib/geo-continent";
import type { LiveShelfMeta } from "@/lib/live-category-shelf";
import { useLiveOpenCategory } from "@/hooks/use-live-open-category";
import { useLiveShelfBrowse } from "@/hooks/use-live-shelf-browse";
import { useDeferredMount } from "@/hooks/use-deferred-mount";
import { useShelfNowPlayingMap } from "@/hooks/use-shelf-now-playing";
import { useLiveBrowseUi } from "@/store/live-browse-ui";
import {
  CHROME_LAYOUT_SHIFT_EVENT,
  isMobileShellWidth,
  mobileShellMediaQuery,
} from "@/lib/shell-layout";
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
  useSyncExternalStore,
} from "react";

const MAX_PER_SHELF_WEB = 6;
const MAX_PER_SHELF_TV = 10;
const INITIAL_SHELF_COUNT_WEB = 8;
const INITIAL_SHELF_COUNT_TV = 14;
const SHELF_LOAD_INCREMENT_WEB = 8;
const SHELF_LOAD_INCREMENT_TV = 10;

export type WebLiveBrowsePagedProps = {
  creds: XtreamCredentials;
  openChannel: (
    c: import("@/lib/xtream-types").LiveStream,
    shelf?: LiveShelfMeta
  ) => void;
  /** Living-room TV — larger cards, faster shelf EPG, TV D-pad targets. */
  tvLivingRoom?: boolean;
};

function WebLiveBrowsePagedInner({
  creds,
  openChannel,
  tvLivingRoom = false,
}: WebLiveBrowsePagedProps) {
  const activeStreamId = usePlayer((s) => s.current?.id);
  const storedRegion = usePrefs((s) => s.tvRegionFilter);
  const setStoredRegion = usePrefs((s) => s.setTvRegionFilter);
  const { openCategory, closeCategory } = useLiveOpenCategory();
  const setShelfEpgHints = useLiveBrowseUi((s) => s.setShelfEpgHints);

  const region: TvRegion = coerceTvRegion(storedRegion) ?? detectRegionFromTimezone();

  const maxPerShelf = tvLivingRoom ? MAX_PER_SHELF_TV : MAX_PER_SHELF_WEB;
  const initialVisible = tvLivingRoom
    ? INITIAL_SHELF_COUNT_TV
    : INITIAL_SHELF_COUNT_WEB;
  const loadIncrement = tvLivingRoom
    ? SHELF_LOAD_INCREMENT_TV
    : SHELF_LOAD_INCREMENT_WEB;

  const {
    allShelves,
    visibleShelfCount,
    hasMore,
    shelvesBuilding,
    shelvesReadyToReveal,
    loadingMoreCategories,
    shelfError,
    retryShelves,
    loadMoreShelves,
    resetVisible,
    totalCategoriesInRegion,
  } = useLiveShelfBrowse({
    creds,
    region,
    maxPerShelf,
    initialVisible,
    loadIncrement,
    enabled: true,
  });

  const handleRegionChange = useCallback(
    (r: TvRegion) => {
      closeCategory();
      setShelfEpgHints([]);
      setStoredRegion(r);
      resetVisible();
    },
    [closeCategory, setShelfEpgHints, setStoredRegion, resetVisible]
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

  const mobileShell = useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia(mobileShellMediaQuery());
      mq.addEventListener("change", onStoreChange);
      return () => mq.removeEventListener("change", onStoreChange);
    },
    () => isMobileShellWidth(),
    () => false
  );
  const shelfVariant = tvLivingRoom ? "tv" : "web";
  const shelfEpgReady = useDeferredMount(
    tvLivingRoom ? 600 : mobileShell ? 2_500 : 120,
    tvLivingRoom ? 4_000 : mobileShell ? 8_000 : 2_400
  );

  const shelfNowPlayingMap = useShelfNowPlayingMap(
    creds,
    shelfEpgChannels,
    categoryNameById,
    shelfEpgReady && shelfEpgChannels.length > 0,
    tvLivingRoom ? 24 : mobileShell ? 16 : 48
  );

  useEffect(() => {
    const hints: Array<{ streamId: number; title: string }> = [];
    for (const shelf of allShelves.slice(0, visibleShelfCount)) {
      for (const c of shelf.preview) {
        const title = shelfNowPlayingMap.get(c.stream_id);
        if (title) hints.push({ streamId: c.stream_id, title });
      }
    }
    setShelfEpgHints(hints);
  }, [
    allShelves,
    visibleShelfCount,
    shelfNowPlayingMap,
    setShelfEpgHints,
  ]);

  const renderShelfRow = useCallback(
    (shelf: LiveShelfMeta) => (
      <LiveShelfRow
        shelf={shelf}
        maxPerShelf={maxPerShelf}
        creds={creds}
        variant={shelfVariant}
        activeStreamId={activeStreamId}
        nowPlayingMap={shelfNowPlayingMap}
        onSeeAll={() => handleOpenCategory(shelf)}
        onPlay={openChannel}
      />
    ),
    [
      creds,
      activeStreamId,
      openChannel,
      handleOpenCategory,
      shelfNowPlayingMap,
      shelfVariant,
    ]
  );

  const onLoadMore = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      loadMoreShelves();
    },
    [loadMoreShelves]
  );

  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  const shelfLoadSettledAtRef = useRef(0);
  useEffect(() => {
    if (!shelvesBuilding) {
      shelfLoadSettledAtRef.current = Date.now();
    }
  }, [shelvesBuilding]);

  useEffect(() => {
    const onChromeShift = () => {
      shelfLoadSettledAtRef.current = Date.now();
    };
    window.addEventListener(CHROME_LAYOUT_SHIFT_EVENT, onChromeShift);
    return () =>
      window.removeEventListener(CHROME_LAYOUT_SHIFT_EVENT, onChromeShift);
  }, []);

  useEffect(() => {
    if (!hasMore || shelvesBuilding) return;
    const el = loadMoreSentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        if (Date.now() - shelfLoadSettledAtRef.current < (mobileShell ? 900 : 450)) return;
        loadMoreShelves();
      },
      { rootMargin: "280px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, shelvesBuilding, loadMoreShelves, mobileShell]);

  return (
    <div className={tvLivingRoom ? "space-y-5 py-1 tv-live-shelves" : "space-y-6 py-2"}>
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
                · loading more…
              </span>
            ) : null}
          </p>
          <WebRegionPicker region={region} onChange={handleRegionChange} />
        </div>

        {shelfError ? (
          <div className="rounded-xl border border-(--danger)/35 bg-(--danger)/10 px-4 py-4 text-sm text-(--text-dim) space-y-3">
            <p>{shelfError}</p>
            <button
              type="button"
              onClick={retryShelves}
              className="inline-flex min-h-10 items-center rounded-xl btn-brand px-4 text-sm font-medium text-white"
            >
              Try again
            </button>
          </div>
        ) : null}

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
