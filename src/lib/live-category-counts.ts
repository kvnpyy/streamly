import { looksAdult } from "@/lib/utils";
import type { LiveStream } from "@/lib/xtream-types";

type CountOpts = {
  hideAdult: boolean;
  parentalUnlocked: boolean;
  allowedCatIds: Set<string>;
};

/** Per-category channel counts for pickers (server or client). */
export function buildLiveCategoryCounts(
  streams: LiveStream[],
  opts: CountOpts
): Record<string, number> {
  const map: Record<string, number> = {};
  const filterAdult = opts.hideAdult && !opts.parentalUnlocked;
  for (const s of streams) {
    const cid = String(s.category_id);
    if (filterAdult) {
      if (!opts.allowedCatIds.has(cid)) continue;
      if (looksAdult({ name: s.name, is_adult: s.is_adult })) continue;
    }
    map[cid] = (map[cid] || 0) + 1;
  }
  return map;
}

/**
 * Picker counts from the server index — O(categories), never walks the full stream array.
 */
export function buildLiveCategoryCountsFromIndex(
  streamIdsByCategory: Record<string, number[]>,
  allowedCatIds: Set<string>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const cid of Object.keys(streamIdsByCategory)) {
    if (!allowedCatIds.has(cid)) continue;
    const ids = streamIdsByCategory[cid];
    if (ids?.length) map[cid] = ids.length;
  }
  return map;
}

/**
 * Badge counts for category pickers when adult groups are hidden.
 * Uses server totals for visible categories (names already filtered upstream).
 */
export function pickCountByIdForVisibleCategories(
  serverCounts: Record<string, number>,
  visibleCategoryIds: readonly string[]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of visibleCategoryIds) {
    const n = serverCounts[id];
    if (typeof n === "number" && n > 0) out[id] = n;
  }
  return out;
}
