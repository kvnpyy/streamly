import { bestTmdbMatchForTitle } from "@/lib/discovery/tmdb-match";
import type { StreamEpgSnapshot } from "@/lib/discovery/live-epg";
import {
  scoreOnNowEntry,
  type ScoredLiveEntry,
} from "@/lib/discovery/live-scoring";
import { filterScoredLiveEntries } from "@/lib/discovery/live-quality";
import { isChannelOnlyListing } from "@/lib/discovery/live-trending-quality";
import { programmeLooksLikeSports } from "@/lib/discovery/sports-keywords";
import type { TmdbTrendingItem } from "@/lib/discovery/types";
import type { LiveStream } from "@/lib/xtream-types";

/** Channels scanned for the Live TV "Trending on TV" shelf. */
export const LIVE_TRENDING_ON_TV_MAX_SCAN = 48;

/** Minimum cards with real programme titles (not channel labels). */
export const LIVE_TRENDING_MIN_ITEMS = 1;

function tmdbPopularityBoost(
  popularity: number,
  maxPop: number
): number {
  return 28 + (popularity / Math.max(maxPop, 1)) * 32;
}

function pushEntry(
  out: ScoredLiveEntry[],
  seen: Set<number>,
  stream: LiveStream,
  programmeTitle: string,
  score: number,
  detail?: string
) {
  if (seen.has(stream.stream_id)) return;
  if (isChannelOnlyListing(programmeTitle, stream.name)) return;
  seen.add(stream.stream_id);
  out.push({ stream, programmeTitle, score, detail });
}

/**
 * Rank live channels: TMDB weekly interest matched to real on-air programme titles.
 * Does not fall back to raw channel-name rows (no "[USA] ESPN" shelf).
 */
export function buildLiveTrendingOnTv(
  candidateIds: number[],
  channelById: Map<number, LiveStream>,
  snapshots: Map<number, StreamEpgSnapshot>,
  trending: TmdbTrendingItem[],
  recentIds: Set<number>,
  favIds: Set<number>,
  limit = 16
): ScoredLiveEntry[] {
  if (candidateIds.length === 0) return [];

  const maxPop = Math.max(...trending.map((t) => t.popularity), 1);
  const results: ScoredLiveEntry[] = [];
  const seen = new Set<number>();

  for (const streamId of candidateIds) {
    const stream = channelById.get(streamId);
    const onAir = snapshots.get(streamId)?.nowTitle?.trim();
    if (!stream || !onAir) continue;

    const tmdb = bestTmdbMatchForTitle(onAir, trending);
    if (!tmdb) continue;

    const base = scoreOnNowEntry(stream, onAir, recentIds, favIds);
    const detail =
      tmdb.item.title.toLowerCase() !== onAir.toLowerCase()
        ? `Trending: ${tmdb.item.title}`
        : undefined;
    pushEntry(
      results,
      seen,
      stream,
      onAir,
      base + tmdbPopularityBoost(tmdb.item.popularity, maxPop),
      detail
    );
  }

  if (results.length < limit) {
    for (const tmdbItem of trending) {
      if (results.length >= limit) break;
      let best: {
        stream: LiveStream;
        onAir: string;
        score: number;
      } | null = null;

      for (const streamId of candidateIds) {
        if (seen.has(streamId)) continue;
        const stream = channelById.get(streamId);
        const onAir = snapshots.get(streamId)?.nowTitle?.trim();
        if (!stream || !onAir) continue;
        const match = bestTmdbMatchForTitle(onAir, [tmdbItem]);
        if (!match) continue;
        const base = scoreOnNowEntry(stream, onAir, recentIds, favIds);
        const score = base + tmdbPopularityBoost(tmdbItem.popularity, maxPop);
        if (!best || score > best.score) {
          best = { stream, onAir, score };
        }
      }

      if (best) {
        pushEntry(
          results,
          seen,
          best.stream,
          best.onAir,
          best.score,
          `Trending: ${tmdbItem.title}`
        );
      }
    }
  }

  for (const streamId of candidateIds) {
    if (results.length >= limit) break;
    const stream = channelById.get(streamId);
    const onAir = snapshots.get(streamId)?.nowTitle?.trim();
    if (!stream || !onAir) continue;
    if (seen.has(streamId)) continue;

    const base = scoreOnNowEntry(stream, onAir, recentIds, favIds);
    const sports = programmeLooksLikeSports(onAir);
    if (!sports && base < 62) continue;
    if (sports && base < 52) continue;

    pushEntry(
      results,
      seen,
      stream,
      onAir,
      base,
      sports ? "Live sports" : undefined
    );
  }

  results.sort((a, b) => b.score - a.score);
  return filterScoredLiveEntries(results).slice(0, limit);
}

export function mergeTmdbTrendingLists(
  movies: TmdbTrendingItem[],
  series: TmdbTrendingItem[]
): TmdbTrendingItem[] {
  const byId = new Map<number, TmdbTrendingItem>();
  for (const item of [...movies, ...series]) {
    const prev = byId.get(item.tmdbId);
    if (!prev || item.popularity > prev.popularity) {
      byId.set(item.tmdbId, item);
    }
  }
  return [...byId.values()].sort((a, b) => b.popularity - a.popularity);
}
