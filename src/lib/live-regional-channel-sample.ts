import "server-only";

import { sortCategoriesForTrendingScan } from "@/lib/discovery/live-trending-categories";
import {
  filterStreamsForTvRegion,
} from "@/lib/live-category-shelf";
import { getShelfCategoriesForRegion } from "@/lib/live-catalog-shelf-category-cache";
import { materializeStreamIds } from "@/lib/live-catalog-stream-map";
import { lookupStreamIdsForCategory } from "@/lib/live-stream-index";
import type { TvRegion } from "@/lib/geo-continent";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import { liveCatalogDiskKey } from "@/lib/xtream-catalog-disk-cache";
import type { SlimLiveCatalog } from "@/lib/slim-live-catalog";

const DEFAULT_MAX_CATEGORIES = 24;
const DEFAULT_PER_CATEGORY = 4;

/**
 * Sample live channels for a TV region (sports/entertainment categories first).
 * Avoids `idsForAll` walk order which often surfaces AU/EU rows before US.
 */
export function collectRegionalChannelSample(
  creds: XtreamCredentials,
  tvRegion: TvRegion,
  bundle: SlimLiveCatalog,
  index: Record<string, number[]>,
  streamById: Map<number, LiveStream>,
  limit: number,
  opts?: { maxCategories?: number; perCategory?: number }
): LiveStream[] {
  if (tvRegion === "All" || !index || !Object.keys(index).length) {
    return [];
  }

  const maxCategories = opts?.maxCategories ?? DEFAULT_MAX_CATEGORIES;
  const perCategory = opts?.perCategory ?? DEFAULT_PER_CATEGORY;
  const diskKey = liveCatalogDiskKey(creds);
  const counts = bundle.countByCategoryId ?? {};
  const categories = sortCategoriesForTrendingScan(
    getShelfCategoriesForRegion(
      diskKey,
      tvRegion,
      bundle.categories,
      counts,
      index
    )
  );

  const seen = new Set<number>();
  const out: LiveStream[] = [];

  for (const cat of categories.slice(0, maxCategories)) {
    const catId = String(cat.category_id);
    const ids = lookupStreamIdsForCategory(index, catId) ?? [];
    const streams = materializeStreamIds(streamById, ids, perCategory * 2);
    const filtered = filterStreamsForTvRegion(
      streams,
      tvRegion,
      cat.category_name
    );
    for (const s of filtered.slice(0, perCategory)) {
      if (seen.has(s.stream_id)) continue;
      seen.add(s.stream_id);
      out.push(s);
      if (out.length >= limit) return out;
    }
  }

  return out;
}
