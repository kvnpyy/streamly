"use client";

import { HorizontalShelfScroll } from "@/components/HorizontalShelfScroll";
import { MediaCard } from "@/components/MediaCard";
import { TvShelf } from "@/components/TvShelf";
import { useTvPresentation } from "@/lib/use-living-room-home-layout";
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
  /** Primary action — play/resume. When set, card click plays; use `detailHref` for info. */
  onClick?: () => void;
  detailHref?: string;
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

function ShelfCards({ items }: { items: MediaShelfItem[] }) {
  return (
    <>
      {items.map((item) => (
        <div
          key={item.id}
          className="shrink-0 w-32 sm:w-36 md:w-40 snap-start"
        >
          <MediaCard
            href={item.onClick ? undefined : item.href}
            onClick={item.onClick}
            detailHref={item.detailHref ?? (item.onClick ? item.href : undefined)}
            poster={item.poster}
            title={item.title}
            subtitle={item.subtitle}
            rating={item.rating}
            isFavorite={item.isFavorite}
            onToggleFavorite={item.onToggleFavorite}
          />
        </div>
      ))}
    </>
  );
}

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
  const tvPresentation = useTvPresentation();

  if (items.length === 0) return null;

  const header = (
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
  );

  if (tvPresentation) {
    return (
      <section>
        {eyebrow && !title ? null : eyebrow && title ? (
          <div className="mb-1 px-0">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
              {eyebrow}
            </p>
          </div>
        ) : null}
        <TvShelf title={title} seeAllHref={seeAllHref}>
          <ShelfCards items={items} />
        </TvShelf>
      </section>
    );
  }

  return (
    <section>
      {header}
      <HorizontalShelfScroll>
        <ShelfCards items={items} />
      </HorizontalShelfScroll>
    </section>
  );
}
