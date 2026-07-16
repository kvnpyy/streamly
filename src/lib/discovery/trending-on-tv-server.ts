import "server-only";

import {
  buildEpgPopularOnTvFallback,
  buildLiveTrendingOnTv,
  LIVE_TRENDING_MIN_ITEMS,
  LIVE_TRENDING_ON_TV_MAX_SCAN,
  mergeTmdbTrendingLists,
} from "@/lib/discovery/live-trending-on-tv";
import { shouldShowTrendingOnTvShelf } from "@/lib/discovery/live-trending-quality";
import { sortCategoriesForTrendingScan } from "@/lib/discovery/live-trending-categories";
import { pickLiveDiscoveryCandidateIds } from "@/lib/discovery/live-candidates";
import type { StreamEpgSnapshot } from "@/lib/discovery/live-epg";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import { resolveTmdbCountry } from "@/lib/discovery/tmdb-region";
import {
  readTmdbTrendingFromDb,
  syncTmdbTrendingToDb,
} from "@/lib/discovery/tmdb-sync";
import {
  shouldServeTrendingResponseCache,
  type TrendingResponseCacheEntry,
} from "@/lib/discovery/trending-on-tv-cache";
import { fetchNowPlayingTitleForChannel } from "@/lib/epg-server-short";
import {
  getBulkServerEpgTitles,
  hydrateServerEpgCache,
  setServerEpgTitlesBatch,
} from "@/lib/epg-server-title-cache";
import { filterStreamsForTvRegion } from "@/lib/live-category-shelf";
import { getShelfCategoriesForRegion } from "@/lib/live-catalog-shelf-category-cache";
import { getCachedLiveCatalogEntry } from "@/lib/live-catalog-server-cache";
import { materializeStreamIds } from "@/lib/live-catalog-stream-map";
import { collectRegionalChannelSample } from "@/lib/live-regional-channel-sample";
import { lookupStreamIdsForCategory } from "@/lib/live-stream-index";
import { liveCatalogDiskKey } from "@/lib/xtream-catalog-disk-cache";
import type { TvRegion } from "@/lib/geo-continent";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";

const EPG_CONCURRENCY = 8;
const MAX_CATEGORIES_SAMPLE = 20;
const CHANNELS_PER_CATEGORY = 8;
/** Cap provider EPG fetches per request (serverless time limits). */
const MAX_EPG_FETCH_PER_REQUEST = 28;
/** Channels from browser EPG cache — primary source for trending after shelf browse. */
const MAX_HINT_STREAMS = 120;

function allIdsWithSnapshots(
  candidateIds: number[],
  snapshots: Map<number, StreamEpgSnapshot>
): number[] {
  const ids = new Set(candidateIds);
  for (const id of snapshots.keys()) ids.add(id);
  return [...ids];
}

function tryEpgFallback(
  candidateIds: number[],
  channelById: Map<number, LiveStream>,
  snapshots: Map<number, StreamEpgSnapshot>,
  recentIds: Set<number>,
  favIds: Set<number>
): ScoredLiveEntry[] {
  const fallback = buildEpgPopularOnTvFallback(
    allIdsWithSnapshots(candidateIds, snapshots),
    channelById,
    snapshots,
    recentIds,
    favIds
  );
  return shouldShowTrendingOnTvShelf(fallback) ? fallback : [];
}

const responseCache = new Map<string, TrendingResponseCacheEntry>();

export type EpgTitleHint = { streamId: number; title: string };

function responseKey(
  creds: XtreamCredentials,
  tvRegion: TvRegion,
  tmdbCountry: string
): string {
  return `${creds.server}|${creds.username}|${tvRegion}|${tmdbCountry}`;
}

/** Test helper — clear in-process shelf cache between cases. */
export function clearTrendingOnTvResponseCacheForTests(): void {
  responseCache.clear();
}

function mergeEpgHintsIntoSnapshots(
  snapshots: Map<number, StreamEpgSnapshot>,
  hints: EpgTitleHint[]
): void {
  for (const { streamId, title } of hints) {
    const trimmed = title?.trim();
    if (!trimmed || !Number.isFinite(streamId) || streamId <= 0) continue;
    snapshots.set(streamId, { nowTitle: trimmed });
  }
}

function collectRegionalStreams(
  creds: XtreamCredentials,
  tvRegion: TvRegion,
  bundle: Awaited<ReturnType<typeof getCachedLiveCatalogEntry>>["bundle"],
  index: Awaited<ReturnType<typeof getCachedLiveCatalogEntry>>["index"],
  streamById: Awaited<ReturnType<typeof getCachedLiveCatalogEntry>>["streamById"]
): LiveStream[] {
  if (tvRegion !== "All") {
    const regional = collectRegionalChannelSample(
      creds,
      tvRegion,
      bundle,
      index,
      streamById,
      LIVE_TRENDING_ON_TV_MAX_SCAN,
      {
        maxCategories: MAX_CATEGORIES_SAMPLE,
        perCategory: CHANNELS_PER_CATEGORY,
      }
    );
    if (regional.length > 0) return regional;
  }

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

  for (const cat of categories.slice(0, MAX_CATEGORIES_SAMPLE)) {
    const catId = String(cat.category_id);
    const ids = lookupStreamIdsForCategory(index, catId) ?? [];
    const streams = materializeStreamIds(
      streamById,
      ids,
      CHANNELS_PER_CATEGORY
    );
    const filtered = filterStreamsForTvRegion(
      streams,
      tvRegion,
      cat.category_name
    );
    for (const s of filtered.slice(0, CHANNELS_PER_CATEGORY)) {
      if (seen.has(s.stream_id)) continue;
      seen.add(s.stream_id);
      out.push(s);
      if (out.length >= LIVE_TRENDING_ON_TV_MAX_SCAN) return out;
    }
  }

  return out;
}

function filterEpgHintsForRegion(
  hints: EpgTitleHint[],
  tvRegion: TvRegion,
  streamById: Map<number, LiveStream>,
  categories: { category_id: string; category_name: string }[]
): EpgTitleHint[] {
  if (tvRegion === "All" || hints.length === 0) return hints;
  return hints.filter(({ streamId }) => {
    const stream = streamById.get(streamId);
    if (!stream) return false;
    const catName = categoryNameForStream(stream, categories) ?? "";
    return filterStreamsForTvRegion([stream], tvRegion, catName).length > 0;
  });
}

function mergeChannelsWithHints(
  regional: LiveStream[],
  hints: EpgTitleHint[],
  streamById: Map<number, LiveStream>,
  tvRegion: TvRegion,
  categories: { category_id: string; category_name: string }[]
): LiveStream[] {
  const byId = new Map(regional.map((c) => [c.stream_id, c]));
  for (const { streamId } of hints.slice(0, MAX_HINT_STREAMS)) {
    const s = streamById.get(streamId);
    if (!s) continue;
    const catName = categoryNameForStream(s, categories) ?? "";
    if (
      tvRegion !== "All" &&
      filterStreamsForTvRegion([s], tvRegion, catName).length === 0
    ) {
      continue;
    }
    byId.set(streamId, s);
  }
  return [...byId.values()];
}

function categoryNameForStream(
  stream: LiveStream,
  categories: { category_id: string; category_name: string }[]
): string | undefined {
  const sid = String(stream.category_id);
  return categories.find((c) => String(c.category_id) === sid)?.category_name;
}

async function fillEpgSnapshots(
  creds: XtreamCredentials,
  candidateIds: number[],
  snapshots: Map<number, StreamEpgSnapshot>,
  channelById: Map<number, LiveStream>,
  categories: { category_id: string; category_name: string }[]
): Promise<void> {
  const cached = getBulkServerEpgTitles(creds, candidateIds);
  for (const [streamId, title] of cached) {
    snapshots.set(streamId, { nowTitle: title });
  }

  const missing = candidateIds
    .filter((id) => !snapshots.has(id))
    .slice(0, MAX_EPG_FETCH_PER_REQUEST);
  for (let i = 0; i < missing.length; i += EPG_CONCURRENCY) {
    const slice = missing.slice(i, i + EPG_CONCURRENCY);
    await Promise.all(
      slice.map(async (streamId) => {
        const channel = channelById.get(streamId);
        if (!channel) return;
        const title = await fetchNowPlayingTitleForChannel(
          creds,
          channel,
          categoryNameForStream(channel, categories)
        );
        if (title) snapshots.set(streamId, { nowTitle: title });
      })
    );
  }
}

export type TrendingOnTvServerResult = {
  items: ScoredLiveEntry[];
  tmdbCountry: string;
  cached: boolean;
};

export async function buildTrendingOnTvForAccount(
  creds: XtreamCredentials,
  tvRegion: TvRegion,
  opts?: { priorityStreamIds?: number[]; epgHints?: EpgTitleHint[] }
): Promise<TrendingOnTvServerResult> {
  const tmdbCountry = resolveTmdbCountry({ tvRegion });
  const rawHints = opts?.epgHints ?? [];
  const rKey = responseKey(creds, tvRegion, tmdbCountry);
  const cached = responseCache.get(rKey);

  /**
   * Fast path: serve a warm assembled shelf even when the client sends EPG hints.
   * Hints still land in the title cache so the *next* rebuild is richer.
   */
  if (cached && shouldServeTrendingResponseCache(cached)) {
    if (rawHints.length > 0) {
      setServerEpgTitlesBatch(creds, rawHints);
    }
    return {
      items: cached.items,
      tmdbCountry: cached.tmdbCountry,
      cached: true,
    };
  }

  if (cached && !shouldShowTrendingOnTvShelf(cached.items)) {
    responseCache.delete(rKey);
  }

  const { bundle, index, streamById } = await getCachedLiveCatalogEntry(creds);
  const categoryRows = bundle.categories.map((c) => ({
    category_id: c.category_id,
    category_name: c.category_name,
  }));
  const hints = filterEpgHintsForRegion(
    rawHints,
    tvRegion,
    streamById,
    categoryRows
  );

  await hydrateServerEpgCache(creds);
  if (hints.length > 0) {
    setServerEpgTitlesBatch(creds, hints);
  }

  let channels = collectRegionalStreams(creds, tvRegion, bundle, index, streamById);

  if (channels.length === 0 && tvRegion !== "All") {
    channels = collectRegionalStreams(creds, "All", bundle, index, streamById);
  }

  channels = mergeChannelsWithHints(
    channels,
    hints,
    streamById,
    tvRegion,
    categoryRows
  );

  const channelById = new Map<number, LiveStream>();
  for (const c of channels) channelById.set(c.stream_id, c);
  for (const { streamId } of hints) {
    const s = streamById.get(streamId);
    if (!s) continue;
    const catName = categoryNameForStream(s, categoryRows) ?? "";
    if (
      tvRegion !== "All" &&
      filterStreamsForTvRegion([s], tvRegion, catName).length === 0
    ) {
      continue;
    }
    channelById.set(streamId, s);
  }

  const recentIds = new Set<number>();
  const favIds = new Set<number>();
  for (const id of opts?.priorityStreamIds ?? []) {
    recentIds.add(id);
  }

  const snapshots = new Map<number, StreamEpgSnapshot>();
  mergeEpgHintsIntoSnapshots(snapshots, hints);

  if (hints.length >= LIVE_TRENDING_MIN_ITEMS) {
    const hintIds = hints
      .map((h) => h.streamId)
      .filter((id) => channelById.has(id));
    const quick = tryEpgFallback(hintIds, channelById, snapshots, recentIds, favIds);
    if (quick.length > 0) {
      responseCache.set(rKey, {
        items: quick,
        tmdbCountry,
        at: Date.now(),
      });
      return { items: quick, tmdbCountry, cached: false };
    }
  }

  const candidateIds = pickLiveDiscoveryCandidateIds(
    [...channelById.values()],
    [],
    [],
    LIVE_TRENDING_ON_TV_MAX_SCAN,
    [
      ...(opts?.priorityStreamIds ?? []),
      ...hints.slice(0, MAX_HINT_STREAMS).map((h) => h.streamId),
    ]
  );

  const hintFetchIds = hints
    .map((h) => h.streamId)
    .filter((id) => !snapshots.has(id));

  await fillEpgSnapshots(
    creds,
    hintFetchIds,
    snapshots,
    channelById,
    categoryRows
  );
  await fillEpgSnapshots(
    creds,
    candidateIds,
    snapshots,
    channelById,
    categoryRows
  );

  let { movieTrending, tvTrending } = await readTmdbTrendingFromDb(tmdbCountry);
  if (
    movieTrending.length === 0 &&
    tvTrending.length === 0 &&
    process.env.TMDB_API_TOKEN?.trim()
  ) {
    await syncTmdbTrendingToDb(tmdbCountry);
    ({ movieTrending, tvTrending } = await readTmdbTrendingFromDb(tmdbCountry));
  }
  const tmdbMerged = mergeTmdbTrendingLists(movieTrending, tvTrending);

  const built = buildLiveTrendingOnTv(
    candidateIds,
    channelById,
    snapshots,
    tmdbMerged,
    recentIds,
    favIds
  );
  let items = shouldShowTrendingOnTvShelf(built) ? built : [];

  if (items.length === 0) {
    items = tryEpgFallback(
      candidateIds,
      channelById,
      snapshots,
      recentIds,
      favIds
    );
  }

  if (items.length > 0) {
    responseCache.set(rKey, { items, tmdbCountry, at: Date.now() });
  }
  if (responseCache.size > 200) {
    const oldest = [...responseCache.entries()].sort(
      (a, b) => a[1].at - b[1].at
    )[0];
    if (oldest) responseCache.delete(oldest[0]);
  }

  return { items, tmdbCountry, cached: false };
}
