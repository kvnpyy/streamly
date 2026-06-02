import { looksAdult, parsePositiveRouteId } from "@/lib/utils";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";
import { yieldToMain } from "@/lib/yield-to-main";

type SafeOpts = {
  hideAdult: boolean;
  parentalUnlocked: boolean;
};

function vodSafe(m: VodStream, opts: SafeOpts): boolean {
  if (!opts.hideAdult || opts.parentalUnlocked) return true;
  return !looksAdult({ name: m.name, is_adult: m.is_adult });
}

function seriesSafe(s: SeriesItem, opts: SafeOpts): boolean {
  if (!opts.hideAdult || opts.parentalUnlocked) return true;
  return !looksAdult({ name: s.name });
}

/** O(n) top-K by rating — avoids sorting the full VOD catalog. */
export async function pickTopMoviesByRating(
  movies: VodStream[],
  limit: number,
  opts: SafeOpts
): Promise<VodStream[]> {
  const best: Array<{ rating: number; stream: VodStream }> = [];
  const CHUNK = 2_000;
  for (let i = 0; i < movies.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, movies.length);
    for (let j = i; j < end; j++) {
      const m = movies[j]!;
      if (!vodSafe(m, opts)) continue;
      if (parsePositiveRouteId(m.stream_id) == null) continue;
      const rating = parseFloat(m.rating || "0") || 0;
      if (best.length < limit) {
        best.push({ rating, stream: m });
        best.sort((a, b) => b.rating - a.rating);
        continue;
      }
      if (rating <= best[best.length - 1]!.rating) continue;
      best[best.length - 1] = { rating, stream: m };
      best.sort((a, b) => b.rating - a.rating);
    }
    if (end < movies.length) await yieldToMain();
  }
  return best.map((b) => b.stream);
}

/** O(n) top-K by last_modified for series. */
export async function pickNewestSeries(
  series: SeriesItem[],
  limit: number,
  opts: SafeOpts
): Promise<SeriesItem[]> {
  const best: Array<{ ts: number; item: SeriesItem }> = [];
  const CHUNK = 2_000;
  for (let i = 0; i < series.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, series.length);
    for (let j = i; j < end; j++) {
      const s = series[j]!;
      if (!seriesSafe(s, opts)) continue;
      if (parsePositiveRouteId(s.series_id) == null) continue;
      const ts = parseInt(s.last_modified || "0", 10) || 0;
      if (best.length < limit) {
        best.push({ ts, item: s });
        best.sort((a, b) => b.ts - a.ts);
        continue;
      }
      if (ts <= best[best.length - 1]!.ts) continue;
      best[best.length - 1] = { ts, item: s };
      best.sort((a, b) => b.ts - a.ts);
    }
    if (end < series.length) await yieldToMain();
  }
  return best.map((b) => b.item);
}
