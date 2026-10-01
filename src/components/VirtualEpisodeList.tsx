"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";

const ROW_EST_PX = 108;
const VIRTUALIZE_MIN = 24;

export type VirtualEpisodeListProps<T> = {
  items: T[];
  itemKey: (item: T) => string | number;
  renderItem: (item: T) => ReactNode;
  /** Scroll this row into view when the season opens. */
  scrollToIndex?: number;
};

/** Single-column episode list; virtualizes long seasons. */
export function VirtualEpisodeList<T>({
  items,
  itemKey,
  renderItem,
  scrollToIndex = -1,
}: VirtualEpisodeListProps<T>) {
  if (items.length < VIRTUALIZE_MIN) {
    return (
      <ShortEpisodeList
        items={items}
        itemKey={itemKey}
        renderItem={renderItem}
        scrollToIndex={scrollToIndex}
      />
    );
  }

  return (
    <VirtualEpisodeListInner
      items={items}
      itemKey={itemKey}
      renderItem={renderItem}
      scrollToIndex={scrollToIndex}
    />
  );
}

function ShortEpisodeList<T>({
  items,
  itemKey,
  renderItem,
  scrollToIndex = -1,
}: VirtualEpisodeListProps<T>) {
  useEffect(() => {
    if (scrollToIndex < 0) return;
    document
      .querySelector(`[data-episode-index="${scrollToIndex}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [scrollToIndex]);

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={itemKey(item)}
          data-episode-index={index}
        >
          {renderItem(item)}
        </div>
      ))}
    </div>
  );
}

function VirtualEpisodeListInner<T>({
  items,
  itemKey,
  renderItem,
  scrollToIndex = -1,
}: VirtualEpisodeListProps<T>) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_EST_PX,
    overscan: 6,
    getItemKey: (index) => String(itemKey(items[index]!)),
  });

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [items.length, virtualizer]);

  useEffect(() => {
    if (scrollToIndex < 0) return;
    virtualizer.scrollToIndex(scrollToIndex, { align: "center" });
  }, [scrollToIndex, virtualizer]);

  return (
    <div
      ref={scrollRef}
      className="w-full overflow-y-auto overscroll-y-contain rounded-xl border border-(--line) bg-(--bg-1)/20"
      style={{
        maxHeight: "min(70dvh, calc(100vh - 14rem))",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        className="relative w-full p-2"
        style={{ height: `${virtualizer.getTotalSize()}px` }}
      >
        {virtualizer.getVirtualItems().map((vi) => {
          const item = items[vi.index];
          if (!item) return null;
          return (
            <div
              key={vi.key}
              data-index={vi.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 w-full box-border pb-2"
              style={{
                top: 0,
                transform: `translateY(${vi.start}px)`,
                minHeight: vi.size,
              }}
            >
              {renderItem(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
