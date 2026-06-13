"use client";

import { cn } from "@/lib/utils";
import { ArrowDownAZ, Star, TrendingUp } from "lucide-react";

export type CatalogSort = "added" | "rating" | "name";

const SORT_ITEMS: {
  value: CatalogSort;
  label: string;
  icon: React.ReactNode;
}[] = [
  { value: "added", label: "New", icon: <TrendingUp className="size-3.5" /> },
  { value: "rating", label: "Rating", icon: <Star className="size-3.5" /> },
  { value: "name", label: "A-Z", icon: <ArrowDownAZ className="size-3.5" /> },
];

export function catalogSortLabel(sort: CatalogSort): string | null {
  if (sort === "rating") return "Highest rated";
  if (sort === "name") return "A–Z";
  return null;
}

export function CatalogSortToggle({
  sort,
  onChange,
}: {
  sort: CatalogSort;
  onChange: (sort: CatalogSort) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Sort catalog"
      className="flex items-center gap-1 p-1 rounded-xl bg-(--bg-2) border border-(--line) w-fit shrink-0 self-start sm:self-auto touch-manipulation"
    >
      {SORT_ITEMS.map((i) => {
        const active = sort === i.value;
        return (
          <button
            key={i.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(i.value)}
            className={cn(
              "flex items-center gap-1.5 min-h-11 px-3 rounded-lg text-xs font-medium transition-colors",
              "active:scale-[0.98] select-none",
              active
                ? "bg-(--bg-3) text-(--text) shadow-sm"
                : "text-(--text-dim) hover:text-(--text)"
            )}
          >
            {i.icon}
            {i.label}
          </button>
        );
      })}
    </div>
  );
}
