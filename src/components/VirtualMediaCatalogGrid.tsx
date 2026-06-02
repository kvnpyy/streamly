"use client";

import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { useVirtualizer, useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

/**
 * Window virtualizers need the document Y-offset of the list anchor. That value
 * shifts when headers/banners above the grid change size; relying only on
 * resize of the anchor misses those cases and can yield an empty virtual range
 * on mobile Safari (black gap under filters).
 */
function useWindowVirtualAnchorMargin(
  anchorRef: RefObject<HTMLElement | null>,
  /** Bumps the subscription when list length or layout above the grid changes. */
  listRevision: unknown
) {
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const update = () => {
      const el = anchorRef.current;
      if (!el) {
        setScrollMargin(0);
        return;
      }
      const rect = el.getBoundingClientRect();
      const y = rect.top + window.scrollY;
      setScrollMargin((prev) => (Math.abs(prev - y) < 0.5 ? prev : y));
    };

    const scheduleUpdate = () => {
      requestAnimationFrame(() => requestAnimationFrame(update));
    };

    scheduleUpdate();
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", scheduleUpdate);
    vv?.addEventListener("scroll", scheduleUpdate);

    const el = anchorRef.current;
    const parent = el?.parentElement ?? null;

    const ro =
      typeof ResizeObserver !== "undefined" && el
        ? new ResizeObserver(scheduleUpdate)
        : null;
    if (el) ro?.observe(el);
    if (parent && parent !== el) ro?.observe(parent);

    /** Discovery shelves / rails above the grid change height without resizing the anchor. */
    const mo =
      typeof MutationObserver !== "undefined" && parent
        ? new MutationObserver(scheduleUpdate)
        : null;
    if (parent) {
      mo?.observe(parent, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: false,
      });
    }

    return () => {
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate);
      vv?.removeEventListener("resize", scheduleUpdate);
      vv?.removeEventListener("scroll", scheduleUpdate);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [listRevision]); // eslint-disable-line react-hooks/exhaustive-deps -- anchorRef stable

  return scrollMargin;
}

const GAP_PX = 16;

/** Match Tailwind `grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5` breakpoints. */
function catalogColsFromViewport(): number {
  if (typeof window === "undefined") return 2;
  const w = window.innerWidth;
  if (w >= 1280) return 5;
  if (w >= 768) return 4;
  if (w >= 640) return 3;
  return 2;
}

function estimateRowHeight(containerWidth: number, cols: number): number {
  const cw = Math.max(240, containerWidth);
  const cellW = (cw - GAP_PX * (cols - 1)) / cols;
  const posterH = cellW * 1.5;
  return Math.ceil(posterH + 72);
}

export type VirtualMediaCatalogGridProps<T> = {
  items: T[];
  /** Defaults to 600 — same cap as before virtualization. */
  maxItems?: number;
  /** Extra rows above/below viewport; lower = fewer concurrent poster fetches. Default 2. */
  overscan?: number;
  renderItem: (item: T) => ReactNode;
  itemKey: (item: T, rowIndex: number, colIndex: number) => string | number;
  /** Shown below the virtualized rows (e.g. "Showing first 600..."). */
  footer?: ReactNode;
  /**
   * Opaque value whose string form is mixed into the listRevision key.
   * Change this whenever layout ABOVE the grid changes (e.g. discovery shelves
   * appearing/disappearing) so scrollMargin recalculates and the black-gap is avoided.
   */
  revision?: unknown;
  /**
   * Window virtualization breaks when large discovery rails sit above the grid
   * (blank scroll region). Plain grid is used when true — still capped at maxItems.
   */
  plainGrid?: boolean;
};

/**
 * Window-scrolled virtual rows for large movie/series grids — only mounts rows near the viewport.
 */
export function VirtualMediaCatalogGrid<T>({
  items,
  maxItems = 600,
  overscan = 2,
  renderItem,
  itemKey,
  footer,
  revision,
  plainGrid = false,
}: VirtualMediaCatalogGridProps<T>) {
  const sliced = useMemo(() => items.slice(0, maxItems), [items, maxItems]);
  const anchorRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(2);
  const [containerWidth, setContainerWidth] = useState(800);
  // Combine sliced.length with revision so scrollMargin refreshes when shelves above toggle.
  const listRevision = `${sliced.length}:${String(revision ?? "")}`;
  const scrollMargin = useWindowVirtualAnchorMargin(anchorRef, listRevision);

  const rows = useMemo(() => {
    const out: T[][] = [];
    for (let i = 0; i < sliced.length; i += cols) {
      out.push(sliced.slice(i, i + cols));
    }
    return out;
  }, [sliced, cols]);

  const rowHeight = estimateRowHeight(containerWidth, cols);

  /** Index-only keys reuse cached row heights after big filters shrink the list — total scroll height stays huge. */
  const getRowItemKey = useMemo(
    () => (index: number) => {
      const row = rows[index];
      if (!row?.length) return index;
      return row.map((item, ci) => String(itemKey(item, index, ci))).join("\x1f");
    },
    [rows, itemKey]
  );

  useLayoutEffect(() => {
    const update = () => {
      setCols(catalogColsFromViewport());
      const el = gridRef.current ?? anchorRef.current?.parentElement;
      if (el) {
        setContainerWidth(el.offsetWidth);
      }
    };
    update();
    window.addEventListener("resize", update);
    const el = gridRef.current ?? anchorRef.current?.parentElement;
    const ro =
      typeof ResizeObserver !== "undefined" && el
        ? new ResizeObserver(update)
        : null;
    ro?.observe(el!);
    return () => {
      window.removeEventListener("resize", update);
      ro?.disconnect();
    };
  }, [sliced.length]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => rowHeight,
    overscan: Math.max(overscan, 3),
    scrollMargin,
    getItemKey: getRowItemKey,
  });

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [rows.length, scrollMargin, cols, rowHeight, listRevision, virtualizer]);

  if (plainGrid && sliced.length > 0) {
    return (
      <>
        <div ref={anchorRef} className="h-0 w-full shrink-0" aria-hidden />
        <div ref={gridRef} className="w-full">
          <TvSpatialGrid
            className="grid w-full gap-4"
            style={{
              gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            }}
          >
            {sliced.map((item, idx) => {
              const rowIndex = Math.floor(idx / cols);
              const colIdx = idx % cols;
              return (
                <div key={itemKey(item, rowIndex, colIdx)} className="min-w-0">
                  {renderItem(item)}
                </div>
              );
            })}
          </TvSpatialGrid>
        </div>
        {footer}
      </>
    );
  }

  return (
    <>
      <div ref={anchorRef} className="h-0 w-full shrink-0" aria-hidden />
      <div ref={gridRef} className="w-full min-h-[1px]">
        <TvSpatialGrid
          key={listRevision}
          className="relative w-full [transform:translateZ(0)]"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            if (!row) return null;
            const rowOffset = vi.start - scrollMargin;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                className="absolute left-0 top-0 w-full"
                style={{
                  transform: `translate3d(0, ${rowOffset}px, 0)`,
                  WebkitTransform: `translate3d(0, ${rowOffset}px, 0)`,
                  height: vi.size,
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: GAP_PX,
                }}
              >
                {row.map((item, colIdx) => (
                  <div key={itemKey(item, vi.index, colIdx)} className="min-w-0">
                    {renderItem(item)}
                  </div>
                ))}
              </div>
            );
          })}
        </TvSpatialGrid>
      </div>
      {footer}
    </>
  );
}

const LIVE_GAP_PX = 12;

/** Match Live list `grid-cols-1 xl:grid-cols-2`. */
function liveColsFromViewport(): number {
  if (typeof window === "undefined") return 1;
  return window.innerWidth >= 1280 ? 2 : 1;
}

/** Approximate channel tile row height (list layout). */
const LIVE_ROW_EST_PX = 152;

export type VirtualLiveChannelGridProps<T> = {
  items: T[];
  maxItems?: number;
  renderItem: (item: T) => ReactNode;
  itemKey: (item: T, rowIndex: number, colIndex: number) => string | number;
  footer?: ReactNode;
  /** Override scroll panel max-height (e.g. full overlay: `calc(100dvh - 8rem)`). */
  scrollMaxHeight?: string;
  scrollClassName?: string;
};

export function VirtualLiveChannelGrid<T>({
  items,
  maxItems = 600,
  renderItem,
  itemKey,
  footer,
  scrollMaxHeight,
  scrollClassName,
}: VirtualLiveChannelGridProps<T>) {
  const sliced = useMemo(() => items.slice(0, maxItems), [items, maxItems]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);

  const rows = useMemo(() => {
    const out: T[][] = [];
    for (let i = 0; i < sliced.length; i += cols) {
      out.push(sliced.slice(i, i + cols));
    }
    return out;
  }, [sliced, cols]);

  const getRowItemKey = useMemo(
    () => (index: number) => {
      const row = rows[index];
      if (!row?.length) return index;
      return row.map((item, ci) => String(itemKey(item, index, ci))).join("\x1f");
    },
    [rows, itemKey]
  );

  useLayoutEffect(() => {
    const update = () => setCols(liveColsFromViewport());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [sliced.length]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LIVE_ROW_EST_PX,
    overscan: 5,
    getItemKey: getRowItemKey,
  });

  const truncated = items.length > maxItems;

  return (
    <div className="space-y-2">
      <div
        ref={scrollRef}
        className={`live-channel-scroll w-full flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-y-contain rounded-xl border border-(--line) bg-(--bg-1)/30 ${scrollClassName ?? ""}`}
        style={{
          maxHeight:
            scrollMaxHeight ?? "min(72dvh, calc(100vh - 11rem))",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          className="relative w-full p-2 sm:p-3"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            if (!row) return null;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 w-full box-border"
                style={{
                  top: 0,
                  transform: `translateY(${vi.start}px)`,
                  minHeight: vi.size,
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                  gap: LIVE_GAP_PX,
                }}
              >
                {row.map((item, colIdx) => (
                  <div key={itemKey(item, vi.index, colIdx)} className="min-w-0">
                    {renderItem(item)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
      {truncated && (
        <p className="text-xs text-(--text-muted) px-1">
          Showing first {maxItems.toLocaleString()} of {items.length.toLocaleString()}{" "}
          channels. Pick a category or search to narrow the list.
        </p>
      )}
      {footer}
    </div>
  );
}
