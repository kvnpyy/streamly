import { isSpamLiveListing } from "@/lib/discovery/live-quality";
import type {
  RegionalTrendReason,
  RegionalTrendingBuildInput,
  RegionalTrendingCard,
} from "@/lib/discovery/regional-trending-types";
import type { MediaShelfItem } from "@/components/MediaShelf";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";

export const REGIONAL_TRENDING_MIN_ITEMS = 4;
export const REGIONAL_TRENDING_DEFAULT_LIMIT = 14;

const MAX_PER_KIND = { live: 5, movie: 5, series: 5 } as const;

const FINALE_RE = /\bfinale\b/i;

function signalForReason(reason: RegionalTrendReason): string {
  switch (reason) {
    case "tmdb_movie":
    case "tmdb_series":
      return "TMDB search interest this week";
    case "sports_main":
      return "MMA main card on your guide";
    case "sports_card":
      return "Fight night on your guide";
    case "finale":
      return "Finale on your guide now";
    case "on_now_hype":
      return "On your guide now";
    case "tonight_prime":
      return "Prime time on your guide tonight";
    case "catalog_top_movie":
      return "Top rated in your playlist";
    case "catalog_new_series":
      return "New & updated in your catalog";
    case "catalog_featured_live":
      return "Your recents and favorites";
    default:
      return "Matched in your catalog";
  }
}

function normalizePopularity(values: number[]): (v: number, i: number) => number {
  const max = Math.max(...values, 1);
  return (_v, i) => {
    const p = values[i] ?? 0;
    return 40 + (p / max) * 35;
  };
}

function liveReason(entry: ScoredLiveEntry, slot: "on_now" | "tonight" | "sports"): RegionalTrendReason {
  const title = entry.programmeTitle || "";
  if (FINALE_RE.test(title)) return "finale";
  if (slot === "tonight") return "tonight_prime";
  if (slot === "sports") {
    const detail = (entry.detail || "").toLowerCase();
    if (detail.includes("ufc") && /\b\d{3}\b/.test(detail)) return "sports_main";
    return "sports_card";
  }
  return "on_now_hype";
}

function pushLive(
  out: RegionalTrendingCard[],
  seen: Set<string>,
  entry: ScoredLiveEntry,
  slot: "on_now" | "tonight" | "sports",
  scoreBoost = 0
) {
  const id = entry.stream.stream_id;
  const key = `live:${id}`;
  if (seen.has(key)) return;
  if (isSpamLiveListing(entry.stream.name, entry.programmeTitle)) return;
  seen.add(key);
  const reason = liveReason(entry, slot);
  out.push({
    key,
    kind: "live",
    title: entry.stream.name,
    signal: entry.detail
      ? `${signalForReason(reason)} · ${entry.detail}`
      : signalForReason(reason),
    reason,
    score: entry.score + scoreBoost,
    poster: entry.stream.stream_icon,
    badge: "Live",
    liveEntry: entry,
    stream: entry.stream,
    isFavorite: undefined,
  });
}

function pushVod(
  out: RegionalTrendingCard[],
  seen: Set<string>,
  item: MediaShelfItem,
  kind: "movie" | "series",
  score: number,
  reason: RegionalTrendReason
) {
  const key = `${kind}:${item.id}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push({
    key,
    kind,
    title: item.title,
    signal: signalForReason(reason),
    reason,
    score,
    poster: item.poster,
    badge: kind === "movie" ? "Movie" : "Series",
    href: item.href,
    rating: item.rating,
    isFavorite: item.isFavorite,
    onToggleFavorite: item.onToggleFavorite,
  });
}

function applyKindCaps(
  sorted: RegionalTrendingCard[],
  limit: number
): RegionalTrendingCard[] {
  const counts = { live: 0, movie: 0, series: 0 };
  const picked: RegionalTrendingCard[] = [];
  for (const card of sorted) {
    if (picked.length >= limit) break;
    if (counts[card.kind] >= MAX_PER_KIND[card.kind]) continue;
    counts[card.kind]++;
    picked.push(card);
  }
  return picked;
}

/**
 * Merge TMDB, sports, and EPG signals into one cross-type shelf (Phase 4).
 * Google Trends deferred — labels reflect actual sources only.
 */
export function buildRegionalTrending(
  input: RegionalTrendingBuildInput
): RegionalTrendingCard[] {
  const limit = input.limit ?? REGIONAL_TRENDING_DEFAULT_LIMIT;
  const candidates: RegionalTrendingCard[] = [];
  const seen = new Set<string>();

  const moviePopScore = normalizePopularity(input.tmdbMoviePopularity);
  input.tmdbMovies.slice(0, 12).forEach((item, i) => {
    pushVod(
      candidates,
      seen,
      item,
      "movie",
      moviePopScore(0, i),
      "tmdb_movie"
    );
  });

  const seriesPopScore = normalizePopularity(input.tmdbSeriesPopularity);
  input.tmdbSeries.slice(0, 12).forEach((item, i) => {
    pushVod(
      candidates,
      seen,
      item,
      "series",
      seriesPopScore(0, i),
      "tmdb_series"
    );
  });

  for (const entry of input.sportsEvents.slice(0, 8)) {
    const boost = entry.detail?.toLowerCase().includes("ufc") ? 12 : 0;
    pushLive(candidates, seen, entry, "sports", 20 + boost);
  }

  for (const entry of input.onNow.slice(0, 10)) {
    pushLive(candidates, seen, entry, "on_now", 5);
  }

  for (const entry of input.tonight.slice(0, 8)) {
    pushLive(candidates, seen, entry, "tonight", 0);
  }

  candidates.sort((a, b) => b.score - a.score);
  return applyKindCaps(candidates, limit);
}

export function shouldShowRegionalTrending(
  items: RegionalTrendingCard[],
  minItems = REGIONAL_TRENDING_MIN_ITEMS
): boolean {
  return items.length >= minItems;
}

/** TV fallback when TMDB/EPG signals are still loading or thin. */
export function appendCatalogFallbacks(
  items: RegionalTrendingCard[],
  fallbacks: RegionalTrendingCard[],
  minItems: number,
  limit: number
): RegionalTrendingCard[] {
  if (items.length >= minItems) {
    return items.slice(0, limit);
  }
  const seen = new Set(items.map((c) => c.key));
  const merged = [...items];
  for (const card of fallbacks) {
    if (merged.length >= limit) break;
    if (seen.has(card.key)) continue;
    seen.add(card.key);
    merged.push(card);
  }
  return merged.slice(0, limit);
}

export function vodShelfToTrendingCards(
  shelfItems: MediaShelfItem[],
  kind: "movie" | "series",
  reason: "catalog_top_movie" | "catalog_new_series",
  baseScore: number
): RegionalTrendingCard[] {
  return shelfItems.map((item, i) => ({
    key: `${kind}:catalog:${item.id}`,
    kind,
    title: item.title,
    signal: signalForReason(reason),
    reason,
    score: baseScore - i * 2,
    poster: item.poster,
    badge: kind === "movie" ? "Movie" : "Series",
    href: item.href,
    rating: item.rating,
    isFavorite: item.isFavorite,
    onToggleFavorite: item.onToggleFavorite,
  }));
}

export function liveEntriesToTrendingCards(
  entries: ScoredLiveEntry[],
  baseScore: number
): RegionalTrendingCard[] {
  return entries.map((entry, i) => ({
    key: `live:catalog:${entry.stream.stream_id}`,
    kind: "live" as const,
    title: entry.stream.name,
    signal: signalForReason("catalog_featured_live"),
    reason: "catalog_featured_live" as const,
    score: baseScore - i * 2,
    poster: entry.stream.stream_icon,
    badge: "Live",
    liveEntry: entry,
    stream: entry.stream,
  }));
}
