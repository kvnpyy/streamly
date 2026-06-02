"use client";

import { memo, useMemo, type ReactNode } from "react";

/**
 * Renders only `visibleCount` shelves. Pass a stable `items` array reference so
 * existing rows are not re-created when revealing the next shelf.
 */
function LiveShelfListInner<T>({
  items,
  visibleCount,
  itemKey,
  renderItem,
  footer,
}: {
  items: T[];
  visibleCount: number;
  itemKey: (item: T, index: number) => string;
  renderItem: (item: T, index: number) => ReactNode;
  footer?: ReactNode;
}) {
  const visible = useMemo(() => {
    const n = Math.min(visibleCount, items.length);
    const out: T[] = [];
    for (let i = 0; i < n; i++) out.push(items[i]!);
    return out;
  }, [items, visibleCount]);

  return (
    <div className="space-y-6">
      {visible.map((item, index) => (
        <div
          key={itemKey(item, index)}
          className="[content-visibility:auto] [contain-intrinsic-size:220px] [contain:layout_paint]"
        >
          {renderItem(item, index)}
        </div>
      ))}
      {footer}
    </div>
  );
}

export const LiveShelfList = memo(LiveShelfListInner) as typeof LiveShelfListInner;
