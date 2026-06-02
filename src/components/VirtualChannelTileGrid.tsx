"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

const GAP_PX = 12;
const ROW_EST_PX = 92;

function colsFromViewport(): number {
  if (typeof window === "undefined") return 1;
  if (window.innerWidth >= 1024) return 3;
  if (window.innerWidth >= 640) return 2;
  return 1;
}

export type VirtualChannelTileGridProps<T> = {
  items: T[];
  itemKey: (item: T, rowIndex: number, colIndex: number) => string | number;
  renderItem: (item: T) => ReactNode;
  virtualizeMin?: number;
};

/**
 * Window-scrolled rows for compact channel tiles (search, favorites-style lists).
 */
export function VirtualChannelTileGrid<T>({
  items,
  itemKey,
  renderItem,
  virtualizeMin = 9,
}: VirtualChannelTileGridProps<T>) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  const [scrollMargin, setScrollMargin] = useState(0);

  const rows = useMemo(() => {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += cols) {
      out.push(items.slice(i, i + cols));
    }
    return out;
  }, [items, cols]);

  const getRowItemKey = useMemo(
    () => (index: number) => {
      const row = rows[index];
      if (!row?.length) return index;
      return row
        .map((item, ci) => String(itemKey(item, index, ci)))
        .join("\x1f");
    },
    [rows, itemKey]
  );

  useLayoutEffect(() => {
    const updateCols = () => setCols(colsFromViewport());
    updateCols();
    window.addEventListener("resize", updateCols, { passive: true });
    return () => window.removeEventListener("resize", updateCols);
  }, [items.length]);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const update = () => {
      setScrollMargin(anchor.getBoundingClientRect().top + window.scrollY);
    };
    update();
    window.addEventListener("resize", update, { passive: true });
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [items.length]);

  const virtualizer = useWindowVirtualizer({
    count: rows.length,
    estimateSize: () => ROW_EST_PX,
    overscan: 2,
    scrollMargin,
    getItemKey: getRowItemKey,
  });

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [rows.length, scrollMargin, cols, virtualizer]);

  if (items.length < virtualizeMin) {
    return (
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        style={{ gap: GAP_PX }}
      >
        {items.map((item, index) => (
          <div key={itemKey(item, 0, index)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div ref={anchorRef} className="h-0 w-full shrink-0" aria-hidden />
      <div
        className="relative w-full [transform:translateZ(0)]"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const row = rows[vi.index];
          if (!row) return null;
          const offset = vi.start - scrollMargin;
          return (
            <div
              key={vi.key}
              className="absolute left-0 top-0 w-full box-border"
              style={{
                transform: `translate3d(0, ${offset}px, 0)`,
                WebkitTransform: `translate3d(0, ${offset}px, 0)`,
                minHeight: vi.size,
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
      </div>
    </>
  );
}
