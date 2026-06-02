import { extractYear, normalizeDiscoveryTitle } from "@/lib/discovery/normalize-title";
import type { TmdbTrendingItem } from "@/lib/discovery/types";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";

export type CatalogTitleEntry = {
  id: number;
  title: string;
  year?: string;
  normalized: string;
};

export function catalogTitleEntriesFromMovies(
  movies: VodStream[],
  parseId: (m: VodStream) => number | null
): CatalogTitleEntry[] {
  const out: CatalogTitleEntry[] = [];
  for (const m of movies) {
    const id = parseId(m);
    if (id == null) continue;
    const title = (m.title || m.name || "").trim();
    if (!title) continue;
    out.push({
      id,
      title,
      year: extractYear(m.year) ?? extractYear(m.name),
      normalized: normalizeDiscoveryTitle(title),
    });
  }
  return out;
}

export function catalogTitleEntriesFromSeries(
  series: SeriesItem[],
  parseId: (s: SeriesItem) => number | null
): CatalogTitleEntry[] {
  const out: CatalogTitleEntry[] = [];
  for (const s of series) {
    const id = parseId(s);
    if (id == null) continue;
    const title = (s.title || s.name || "").trim();
    if (!title) continue;
    out.push({
      id,
      title,
      year: extractYear(s.year) ?? extractYear(s.releaseDate) ?? extractYear(s.name),
      normalized: normalizeDiscoveryTitle(title),
    });
  }
  return out;
}

function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) {
    const shorter = Math.min(a.length, b.length);
    const longer = Math.max(a.length, b.length);
    return shorter / longer;
  }
  const aTokens = new Set(a.split(" ").filter(Boolean));
  const bTokens = new Set(b.split(" ").filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  let overlap = 0;
  for (const t of aTokens) {
    if (bTokens.has(t)) overlap++;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

const MATCH_THRESHOLD = 0.72;

/**
 * Map TMDB trending rows to Xtream IDs. Unmatched items are omitted (v1 policy).
 */
export function matchTmdbTrendingToCatalog(
  trending: TmdbTrendingItem[],
  catalog: CatalogTitleEntry[],
  limit = 24
): number[] {
  const used = new Set<number>();
  const ids: number[] = [];

  for (const t of trending) {
    const normTmdb = normalizeDiscoveryTitle(t.title);
    const normOrig = t.originalTitle
      ? normalizeDiscoveryTitle(t.originalTitle)
      : "";
    let best: { id: number; score: number } | null = null;

    for (const c of catalog) {
      if (used.has(c.id)) continue;
      let score = Math.max(
        titleSimilarity(normTmdb, c.normalized),
        normOrig ? titleSimilarity(normOrig, c.normalized) : 0
      );
      if (t.year && c.year && t.year === c.year) score += 0.12;
      if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
        best = { id: c.id, score };
      }
    }

    if (best) {
      used.add(best.id);
      ids.push(best.id);
    }
    if (ids.length >= limit) break;
  }

  return ids;
}
