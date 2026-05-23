"use client";

import { MediaCard } from "@/components/MediaCard";
import { ChevronRight } from "lucide-react";
import Link from "next/link";

export type MediaShelfItem = {
  id: number;
  href: string;
  poster?: string;
  title: string;
  subtitle?: string;
  rating?: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
};

type MediaShelfProps = {
  /** Section heading text */
  title: string;
  /** Optional eyebrow above the title */
  eyebrow?: string;
  items: MediaShelfItem[];
  /** Optional "See all" link */
  seeAllHref?: string;
};

/**
 * A horizontally scrollable row of MediaCards — the Netflix-style shelf
 * used on Movies / Series pages for "Recently watched", "Top Rated", etc.
 */
export function MediaShelf({
  title,
  eyebrow,
  items,
  seeAllHref,
}: MediaShelfProps) {
  if (items.length === 0) return null;

  return (
    <section>
      {/* Header */}
      <div className="flex items-end justify-between mb-3 px-0">
        <div>
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
              {eyebrow}
            </p>
          )}
          <h2 className="text-base font-bold text-(--text) leading-tight">
            {title}
          </h2>
        </div>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="flex items-center gap-0.5 text-xs text-(--text-dim) hover:text-(--text) transition-colors shrink-0"
          >
            See all
            <ChevronRight className="size-3.5" />
          </Link>
        )}
      </div>

      {/* Scrollable row */}
      <div
        className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {items.map((item) => (
          <div key={item.id} className="shrink-0 w-32 sm:w-36 md:w-40">
            <MediaCard
              href={item.href}
              poster={item.poster}
              title={item.title}
              subtitle={item.subtitle}
              rating={item.rating}
              isFavorite={item.isFavorite}
              onToggleFavorite={item.onToggleFavorite}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
