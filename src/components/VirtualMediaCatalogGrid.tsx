"use client";

import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
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
  /** Bumps the subscription when list length changes (row virtualizer reset). */
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
      setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    const vv = window.visualViewport;
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);

    const el = anchorRef.current;
    const ro =
      typeof ResizeObserver !== "undefined" && el
        ? new ResizeObserver(update)
        : null;
    ro?.observe(el!);

    const io =
      typeof IntersectionObserver !== "undefined" && el
        ? new IntersectionObserver(update, {
            root: null,
            threshold: [0, 0.01, 0.25, 0.5, 1],
          })
        : null;
    io?.observe(el!);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      ro?.disconnect();
      io?.disconnect();
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
}: VirtualMediaCatalogGridProps<T>) {
  const sliced = useMemo(() => items.slice(0, maxItems), [items, maxItems]);
  const anchorRef = useRef<HTMLDivElement>(null);
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
      const el = anchorRef.current;
      if (el) {
        setContainerWidth(el.offsetWidth);
      }
    };
    update();
    window.addEventListener("resize", update);
    const el = anchorRef.current;
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
    overscan,
    scrollMargin,
    getItemKey: getRowItemKey,
  });

  return (
    <>
      <div ref={anchorRef} className="w-full">
        <TvSpatialGrid
          className="relative w-full"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            if (!row) return null;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                className="absolute left-0 top-0 w-full gap-4"
                style={{
                  transform: `translateY(${vi.start}px)`,
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
};

export function VirtualLiveChannelGrid<T>({
  items,
  maxItems = 600,
  renderItem,
  itemKey,
  footer,
}: VirtualLiveChannelGridProps<T>) {
  const sliced = useMemo(() => items.slice(0, maxItems), [items, maxItems]);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  const scrollMargin = useWindowVirtualAnchorMargin(anchorRef, sliced.length);

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
    const update = () => {
      setCols(liveColsFromViewport());
    };
    update();
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
    };
  }, [sliced.length]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => LIVE_ROW_EST_PX,
    overscan: 4,
    scrollMargin,
    getItemKey: getRowItemKey,
  });

  return (
    <>
      <div ref={anchorRef} className="w-full">
        <TvSpatialGrid
          className="relative w-full"
          style={{
            height: `${virtualizer.getTotalSize()}px`,
          }}
        >
          {virtualizer.getVirtualItems().map((vi) => {
            const row = rows[vi.index];
            if (!row) return null;
            return (
              <div
                key={vi.key}
                data-index={vi.index}
                className="absolute left-0 top-0 w-full"
                style={{
                  transform: `translateY(${vi.start}px)`,
                  height: vi.size,
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
        </TvSpatialGrid>
      </div>
      {footer}
    </>
  );
}
