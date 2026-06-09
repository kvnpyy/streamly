import { categoryPassesRegionGate } from "@/lib/live-category-shelf";
import {
  sortLiveCategoriesForBrowse,
  type TvRegion,
} from "@/lib/geo-continent";
import type { Category } from "@/lib/xtream-types";
import { yieldToMain } from "@/lib/yield-to-main";

const FILTER_CHUNK = 48;

/**
 * Build the shelf category list in chunks so region / catalog changes never
 * block the main thread on large IPTV category lists.
 */
export async function buildShelfCategoryListChunked({
  categories,
  idsByCategory,
  countByCategoryId,
  region,
  isStale,
}: {
  categories: Category[];
  idsByCategory?: Record<string, number[]>;
  countByCategoryId?: Record<string, number>;
  region: TvRegion;
  isStale: () => boolean;
}): Promise<Category[]> {
  const out: Category[] = [];
  for (let i = 0; i < categories.length; i++) {
    if (isStale()) return out;
    const c = categories[i]!;
    const catId = String(c.category_id);
    const ids = idsByCategory?.[catId];
    const count = countByCategoryId?.[catId] ?? countByCategoryId?.[String(Number(catId))];
    if (!ids?.length && !(count && count > 0)) continue;
    if (!categoryPassesRegionGate(c.category_name, region)) continue;
    out.push(c);
    if (i > 0 && i % FILTER_CHUNK === 0) {
      await yieldToMain();
      if (isStale()) return sortLiveCategoriesForBrowse(out, region);
    }
  }
  return sortLiveCategoriesForBrowse(out, region);
}
