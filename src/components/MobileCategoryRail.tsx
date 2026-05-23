"use client";

import { useTvBrowser } from "@/components/TvBrowserProvider";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/xtream-types";

/**
 * Horizontal, swipeable category chips for phones — avoids a tall sidebar above content.
 * On TV-class browsers (Fire TV Silk, etc.) chips wrap for D‑Pad / pointer instead of swipe.
 */
export function MobileCategoryRail({
  categories,
  value,
  onChange,
  countById,
  label = "Category",
}: {
  categories: Category[];
  value: string | "all";
  onChange: (id: string | "all") => void;
  countById?: Record<string, number>;
  label?: string;
}) {
  const tvBrowser = useTvBrowser();
  if (categories.length === 0) return null;

  return (
    <div className={cn("-mx-3 px-3", !tvBrowser && "lg:hidden")}>
      <div className="flex items-center justify-between gap-2 mb-2 px-1">
        <span className="text-[11px] uppercase tracking-wider text-(--text-muted)">
          {label}
        </span>
        <span className="text-[10px] text-(--text-muted)">
          {tvBrowser ? "OK / Enter selects" : "Swipe →"}
        </span>
      </div>
      <div
        className={cn(
          "flex gap-2 pb-2.5 pt-0.5 scrollbar-hide tv-shelf-scroll",
          tvBrowser
            ? "overflow-x-auto"
            : "overflow-x-auto snap-x snap-mandatory touch-pan-x"
        )}
        role="tablist"
        aria-label={label}
        style={
          // Samsung Internet requires these to be set as inline styles —
          // Tailwind class equivalents may not be present in the TV CSS bundle.
          tvBrowser
            ? {
                WebkitOverflowScrolling: "touch",
                touchAction: "pan-x",
              }
            : undefined
        }
      >
        <button
          type="button"
          role="tab"
          aria-selected={value === "all"}
          onClick={() => onChange("all")}
          className={cn(
            "shrink-0 snap-start min-h-11 px-4 rounded-full text-sm font-medium border transition-colors active:scale-[0.98]",
            tvBrowser &&
              "min-h-12 px-5 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-0)",
            value === "all"
              ? "bg-(--brand)/25 border-(--brand)/55 text-(--text) shadow-[0_0_20px_-8px_rgba(124,92,255,0.5)]"
              : "bg-(--bg-2) border-(--line) text-(--text-dim)"
          )}
        >
          All
        </button>
        {categories.map((c) => {
          const id = String(c.category_id);
          const active = value !== "all" && String(value) === id;
          const count = countById?.[id];
          return (
            <button
              type="button"
              role="tab"
              key={id}
              aria-selected={active}
              title={c.category_name}
              onClick={() => onChange(id)}
              className={cn(
                "shrink-0 snap-start min-h-11 max-w-[min(72vw,240px)] px-4 rounded-full text-sm font-medium border transition-colors flex items-center gap-1.5 active:scale-[0.98]",
                tvBrowser &&
                  "min-h-12 max-w-[min(100%,22rem)] px-5 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/55 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-0)",
                active
                  ? "bg-(--brand)/25 border-(--brand)/55 text-(--text) shadow-[0_0_20px_-8px_rgba(124,92,255,0.5)]"
                  : "bg-(--bg-2) border-(--line) text-(--text-dim)"
              )}
            >
              <span className="truncate">{c.category_name}</span>
              {typeof count === "number" && (
                <span className="text-[11px] text-(--text-muted) tabular-nums shrink-0">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
