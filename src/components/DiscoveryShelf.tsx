"use client";

import { MediaShelf, type MediaShelfItem } from "@/components/MediaShelf";
import { SkeletonGrid } from "@/components/SectionHeader";
import type { DiscoveryShelfMeta } from "@/lib/discovery/types";

type DiscoveryShelfProps = {
  meta: DiscoveryShelfMeta;
  items: MediaShelfItem[];
  loading?: boolean;
  skeletonCount?: number;
};

/**
 * Honest discovery row — reuses MediaShelf with shelf metadata from
 * `lib/discovery/shelf-meta.ts`.
 */
export function DiscoveryShelf({
  meta,
  items,
  loading = false,
  skeletonCount = 12,
}: DiscoveryShelfProps) {
  if (loading) {
    return (
      <section aria-busy="true" aria-label={meta.title}>
        <div className="mb-3">
          {meta.eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2) mb-0.5">
              {meta.eyebrow}
            </p>
          )}
          <h2 className="text-base font-bold text-(--text) leading-tight">
            {meta.title}
          </h2>
        </div>
        <SkeletonGrid count={skeletonCount} />
      </section>
    );
  }

  if (items.length === 0) return null;

  return (
    <MediaShelf
      eyebrow={meta.eyebrow}
      title={meta.title}
      items={items}
      seeAllHref={meta.seeAllHref}
    />
  );
}
