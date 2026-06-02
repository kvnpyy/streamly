import { categoryPassesRegionGate } from "@/lib/live-category-shelf";
import type { TvRegion } from "@/lib/geo-continent";
import { lookupStreamIdsForCategory } from "@/lib/live-stream-index";
import type { Category } from "@/lib/xtream-types";

type CachedShelfCategories = {
  categories: Category[];
  at: number;
};

const CACHE_TTL_MS = 120_000;
const cache = new Map<string, CachedShelfCategories>();

function cacheKey(
  diskKey: string,
  region: TvRegion,
  categoriesLen: number,
  countKeys: number
): string {
  return `${diskKey}|${region}|${categoriesLen}|${countKeys}`;
}

/**
 * Pre-filtered category list for shelf browse (region + has channels).
 * Built once per catalog snapshot — shelf-categories pagination only slices this array.
 */
export function getShelfCategoriesForRegion(
  diskKey: string,
  region: TvRegion,
  categories: Category[],
  counts: Record<string, number>,
  index: Record<string, number[]>
): Category[] {
  const key = cacheKey(diskKey, region, categories.length, Object.keys(counts).length);
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.categories;

  const out: Category[] = [];
  for (const c of categories) {
    const catId = String(c.category_id);
    const n = counts[catId] ?? counts[String(Number(catId))];
    const hasCount = typeof n === "number" && n > 0;
    const ids = lookupStreamIdsForCategory(index, catId);
    if (!hasCount && !ids?.length) continue;
    if (!categoryPassesRegionGate(c.category_name, region)) continue;
    out.push(c);
  }

  cache.set(key, { categories: out, at: now });
  if (cache.size > 8) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return out;
}
