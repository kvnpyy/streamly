import type { TvRegion } from "@/lib/geo-continent";
import { filterStreamsForTvRegion } from "@/lib/live-category-shelf";
import { lookupStreamIdsForCategory } from "@/lib/live-stream-index";
import {
  normalizeSearchText,
  textMatchesSearch,
} from "@/lib/search-normalize";
import type { LiveStream } from "@/lib/xtream-types";
import type { LiveCatalogBundle } from "@/lib/xtream";

export const LIVE_SEARCH_MATCH_LIMIT = 96;
export const LIVE_SEARCH_SCAN_POOL_LIMIT = 480;

export type LiveCatalogSearchOpts = {
  q: string;
  categoryId?: string | "all";
  tvRegion?: TvRegion;
  matchLimit?: number;
  scanPoolLimit?: number;
};

export type LiveCatalogSearchResult = {
  matches: LiveStream[];
  /** In-scope channels for client programme-title scans (capped). */
  scanPool: LiveStream[];
  totalInScope: number;
};

function categoryNameById(
  categories: LiveCatalogBundle["categories"]
): Map<string, string> {
  return new Map(
    (categories ?? []).map((c) => [String(c.category_id), c.category_name])
  );
}

function streamInScope(
  stream: LiveStream,
  categoryId: string | "all",
  tvRegion: TvRegion,
  catNames: Map<string, string>
): boolean {
  if (categoryId !== "all" && String(stream.category_id) !== String(categoryId)) {
    return false;
  }
  if (tvRegion === "All") return true;
  const catName = catNames.get(String(stream.category_id)) ?? "";
  return filterStreamsForTvRegion([stream], tvRegion, catName).length > 0;
}

function streamsInScope(
  bundle: LiveCatalogBundle,
  index: Record<string, number[]>,
  streamById: Map<number, LiveStream>,
  categoryId: string | "all",
  tvRegion: TvRegion
): LiveStream[] {
  const catNames = categoryNameById(bundle.categories);

  if (categoryId !== "all") {
    const ids = lookupStreamIdsForCategory(index, String(categoryId)) ?? [];
    const out: LiveStream[] = [];
    for (const id of ids) {
      const s = streamById.get(id);
      if (!s) continue;
      if (!streamInScope(s, categoryId, tvRegion, catNames)) continue;
      out.push(s);
    }
    return out;
  }

  if (tvRegion !== "All" && index && Object.keys(index).length > 0) {
    const out: LiveStream[] = [];
    const seen = new Set<number>();
    for (const cat of bundle.categories ?? []) {
      const catId = String(cat.category_id);
      const ids = lookupStreamIdsForCategory(index, catId) ?? [];
      for (const id of ids) {
        if (seen.has(id)) continue;
        const s = streamById.get(id);
        if (!s) continue;
        if (!streamInScope(s, "all", tvRegion, catNames)) continue;
        seen.add(id);
        out.push(s);
      }
    }
    return out;
  }

  return bundle.streams ?? [];
}

/**
 * Full-catalog live channel name search on the server — avoids the 240-row
 * channel sample that left most providers with zero matches.
 */
export function searchLiveCatalog(
  bundle: LiveCatalogBundle,
  index: Record<string, number[]>,
  streamById: Map<number, LiveStream>,
  opts: LiveCatalogSearchOpts
): LiveCatalogSearchResult {
  const needle = normalizeSearchText(opts.q);
  if (!needle) {
    return { matches: [], scanPool: [], totalInScope: 0 };
  }

  const categoryId = opts.categoryId ?? "all";
  const tvRegion = opts.tvRegion ?? "All";
  const matchLimit = Math.max(1, opts.matchLimit ?? LIVE_SEARCH_MATCH_LIMIT);
  const scanPoolLimit = Math.max(
    matchLimit,
    opts.scanPoolLimit ?? LIVE_SEARCH_SCAN_POOL_LIMIT
  );

  const inScope = streamsInScope(
    bundle,
    index,
    streamById,
    categoryId,
    tvRegion
  );

  const matches: LiveStream[] = [];
  for (const s of inScope) {
    if (textMatchesSearch(s.name, needle) && matches.length < matchLimit) {
      matches.push(s);
    }
  }

  /** Prefer name hits first so EPG enrichment targets likely channels. */
  const scanPool: LiveStream[] = [];
  const seen = new Set<number>();
  for (const s of matches) {
    if (scanPool.length >= scanPoolLimit) break;
    scanPool.push(s);
    seen.add(s.stream_id);
  }
  for (const s of inScope) {
    if (scanPool.length >= scanPoolLimit) break;
    if (seen.has(s.stream_id)) continue;
    scanPool.push(s);
    seen.add(s.stream_id);
  }

  return {
    matches,
    scanPool,
    totalInScope: inScope.length,
  };
}
