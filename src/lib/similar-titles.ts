import { parseGenreList } from "@/lib/parse-genres";
import { looksAdult, parsePositiveRouteId } from "@/lib/utils";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";

export type SimilarTitle = {
  id: number;
  title: string;
  poster?: string;
  subtitle?: string;
  rating?: string;
  score: number;
};

function genreOverlapScore(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b.map((g) => g.toLowerCase()));
  let overlap = 0;
  for (const g of a) {
    if (setB.has(g.toLowerCase())) overlap++;
  }
  return overlap / Math.max(a.length, b.length);
}

function pickSimilar<T>(
  items: T[],
  excludeId: number,
  scoreItem: (item: T) => number,
  getId: (item: T) => number | null,
  getTitle: (item: T) => string,
  getPoster: (item: T) => string | undefined,
  getSubtitle: (item: T) => string | undefined,
  getRating: (item: T) => string | undefined,
  limit: number
): SimilarTitle[] {
  const scored: SimilarTitle[] = [];
  for (const item of items) {
    const id = getId(item);
    if (id == null || id === excludeId) continue;
    const title = getTitle(item).trim();
    if (!title) continue;
    const score = scoreItem(item);
    if (score <= 0) continue;
    scored.push({
      id,
      title,
      poster: getPoster(item),
      subtitle: getSubtitle(item),
      rating: getRating(item),
      score,
    });
  }
  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        (parseFloat(b.rating || "0") || 0) - (parseFloat(a.rating || "0") || 0) ||
        a.title.localeCompare(b.title)
    )
    .slice(0, limit);
}

export function pickSimilarMovies(
  movies: VodStream[] | undefined,
  excludeId: number,
  categoryId: string | undefined,
  genreRaw: string | undefined,
  opts: { hideAdult: boolean; parentalUnlocked: boolean },
  limit = 12
): SimilarTitle[] {
  if (!movies?.length) return [];
  const safe = opts.hideAdult && !opts.parentalUnlocked;
  const filtered = safe
    ? movies.filter((m) => !looksAdult({ name: m.name, is_adult: m.is_adult }))
    : movies;
  const sourceGenres = parseGenreList(genreRaw);
  const cat = categoryId?.trim();

  return pickSimilar(
    filtered,
    excludeId,
    (m) => {
      let score = 0;
      if (cat && String(m.category_id) === cat) score += 1;
      if (sourceGenres.length) {
        const nameGenres = parseGenreList(m.name);
        score += genreOverlapScore(sourceGenres, nameGenres) * 0.25;
      }
      return score;
    },
    (m) => parsePositiveRouteId(m.stream_id),
    (m) => m.name,
    (m) => m.stream_icon,
    (m) => m.year,
    (m) => m.rating,
    limit
  );
}

export function pickSimilarSeries(
  series: SeriesItem[] | undefined,
  excludeId: number,
  genreRaw: string | undefined,
  opts: { hideAdult: boolean; parentalUnlocked: boolean },
  limit = 12
): SimilarTitle[] {
  const sourceGenres = parseGenreList(genreRaw);
  if (!sourceGenres.length || !series?.length) return [];
  const safe = opts.hideAdult && !opts.parentalUnlocked;
  const filtered = safe
    ? series.filter((s) => !looksAdult({ name: s.name }))
    : series;
  return pickSimilar(
    filtered,
    excludeId,
    (s) => genreOverlapScore(sourceGenres, parseGenreList(s.genre)),
    (s) => parsePositiveRouteId(s.series_id),
    (s) => s.name,
    (s) => s.cover,
    (s) => s.year,
    (s) => s.rating,
    limit
  );
}
