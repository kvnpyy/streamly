"use client";

import { cn } from "@/lib/utils";

export type TvCategoryGridItem = {
  id: string;
  label: string;
  count?: number;
};

type TvCategoryGridProps = {
  items: TvCategoryGridItem[];
  onSelect: (id: string) => void;
  className?: string;
};

/** Large category buttons for TV remote / D-pad navigation. */
export function TvCategoryGrid({
  items,
  onSelect,
  className,
}: TvCategoryGridProps) {
  return (
    <div className={cn("tv-category-grid", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          data-tv-card-root
          className="tv-category-grid__item focus-ring"
          onClick={() => onSelect(item.id)}
        >
          <span className="tv-category-grid__label">{item.label}</span>
          {item.count != null && item.count > 0 ? (
            <span className="tv-category-grid__count">{item.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
