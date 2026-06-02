"use client";

import { useWindowVirtualizer } from "@tanstack/react-virtual";
import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const SHELF_ROW_EST_PX = 248;

export type VirtualLiveShelfListProps<T> = {
  items: T[];
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  footer?: ReactNode;
  /** Use a plain map when few rows (horizontal shelves + focus are simpler). */
  virtualizeMin?: number;
  rowEstimatePx?: number;
};

/**
 * Vertically virtualizes Live TV category shelves so "Show more" does not mount
 * dozens of horizontal card rows at once.
 */
export function VirtualLiveShelfList<T>({
  items,
  itemKey,
  renderItem,
  footer,
  virtualizeMin = 5,
  rowEstimatePx = SHELF_ROW_EST_PX,
}: VirtualLiveShelfListProps<T>) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    let raf = 0;
    const update = () => {
      setScrollMargin(anchor.getBoundingClientRect().top + window.scrollY);
    };
    const scheduleUpdate = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        update();
      });
    };
    update();
    window.addEventListener("resize", scheduleUpdate, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [items.length]);

  const getItemKey = (index: number) => {
    const item = items[index];
    return item ? itemKey(item, index) : String(index);
  };

  const virtualizer = useWindowVirtualizer({
    count: items.length,
    estimateSize: () => rowEstimatePx,
    overscan: 2,
    scrollMargin,
    getItemKey,
  });

  if (items.length < virtualizeMin) {
    return (
      <div className="space-y-6">
        {items.map((item, index) => (
          <div key={itemKey(item, index)}>{renderItem(item, index)}</div>
        ))}
        {footer}
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
          const item = items[vi.index];
          if (!item) return null;
          const offset = vi.start - scrollMargin;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              className="absolute left-0 top-0 w-full box-border pb-6"
              style={{
                transform: `translate3d(0, ${offset}px, 0)`,
                WebkitTransform: `translate3d(0, ${offset}px, 0)`,
                minHeight: vi.size,
              }}
            >
              {renderItem(item, vi.index)}
            </div>
          );
        })}
      </div>
      {footer}
    </>
  );
}
