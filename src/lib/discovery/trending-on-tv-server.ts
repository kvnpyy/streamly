import "server-only";

import {
  buildLiveTrendingOnTv,
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
const RESPONSE_CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_CATEGORIES_SAMPLE = 20;
const CHANNELS_PER_CATEGORY = 8;
const MAX_HINT_STREAMS = 40;

type ResponseCacheEntry = {
  items: ScoredLiveEntry[];
  tmdbCountry: string;
  at: number;
};
const responseCache = new Map<string, ResponseCacheEntry>();

export type EpgTitleHint = { streamId: number; title: string };

function responseKey(
  creds: XtreamCredentials,
  tvRegion: TvRegion,
  tmdbCountry: string
): string {
  return `${creds.server}|${creds.username}|${tvRegion}|${tmdbCountry}`;
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

function mergeChannelsWithHints(
  regional: LiveStream[],
  hints: EpgTitleHint[],
  streamById: Map<number, LiveStream>
): LiveStream[] {
  const byId = new Map(regional.map((c) => [c.stream_id, c]));
  for (const { streamId } of hints.slice(0, MAX_HINT_STREAMS)) {
    const s = streamById.get(streamId);
    if (s) byId.set(streamId, s);
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

  const missing = candidateIds.filter((id) => !snapshots.has(id));
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
  const hints = opts?.epgHints ?? [];
  const rKey = responseKey(creds, tvRegion, tmdbCountry);
  const cached = responseCache.get(rKey);
  if (
    hints.length === 0 &&
    cached &&
    Date.now() - cached.at < RESPONSE_CACHE_TTL_MS
  ) {
    const fromCache = shouldShowTrendingOnTvShelf(cached.items)
      ? cached.items
      : [];
    if (fromCache.length > 0) {
      return { items: fromCache, tmdbCountry, cached: true };
    }
  }

  await hydrateServerEpgCache(creds);
  if (hints.length > 0) {
    setServerEpgTitlesBatch(creds, hints);
  }

  const { bundle, index, streamById } = await getCachedLiveCatalogEntry(creds);
  let channels = collectRegionalStreams(creds, tvRegion, bundle, index, streamById);

  if (channels.length === 0 && tvRegion !== "All") {
    channels = collectRegionalStreams(creds, "All", bundle, index, streamById);
  }

  channels = mergeChannelsWithHints(channels, hints, streamById);

  const channelById = new Map<number, LiveStream>();
  for (const c of channels) channelById.set(c.stream_id, c);
  for (const { streamId } of hints) {
    const s = streamById.get(streamId);
    if (s) channelById.set(streamId, s);
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

  const snapshots = new Map<number, StreamEpgSnapshot>();
  mergeEpgHintsIntoSnapshots(snapshots, hints);

  const hintFetchIds = hints
    .map((h) => h.streamId)
    .filter((id) => !snapshots.has(id));
  const categoryRows = bundle.categories.map((c) => ({
    category_id: c.category_id,
    category_name: c.category_name,
  }));

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
    new Set(),
    new Set()
  );
  const items = shouldShowTrendingOnTvShelf(built) ? built : [];

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
