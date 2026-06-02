import type { LiveCatalogBundle } from "@/lib/xtream";
import type { Category } from "@/lib/xtream-types";

/** Live browse metadata without shipping channel rows or per-category id arrays to the browser. */
export type SlimLiveCatalog = {
  categories: Category[];
  countByCategoryId: Record<string, number>;
};

export function hasLiveCatalogCounts(
  bundle: SlimLiveCatalog | LiveCatalogBundle | null | undefined
): boolean {
  if (!bundle?.countByCategoryId) return false;
  return Object.keys(bundle.countByCategoryId).length > 0;
}

export function toSlimLiveCatalog(bundle: LiveCatalogBundle): SlimLiveCatalog {
  const counts = bundle.countByCategoryId ?? {};
  if (Object.keys(counts).length > 0) {
    return {
      categories: bundle.categories ?? [],
      countByCategoryId: counts,
    };
  }
  const fromIndex = bundle.streamIdsByCategory;
  if (fromIndex && Object.keys(fromIndex).length > 0) {
    const countByCategoryId: Record<string, number> = {};
    for (const [cid, ids] of Object.entries(fromIndex)) {
      countByCategoryId[cid] = ids?.length ?? 0;
    }
    return { categories: bundle.categories ?? [], countByCategoryId };
  }
  const countByCategoryId: Record<string, number> = {};
  for (const s of bundle.streams ?? []) {
    const cid = String(s.category_id);
    countByCategoryId[cid] = (countByCategoryId[cid] ?? 0) + 1;
  }
  return {
    categories: bundle.categories ?? [],
    countByCategoryId,
  };
}
