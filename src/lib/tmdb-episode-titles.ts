import { normalizeDiscoveryTitle } from "@/lib/discovery/normalize-title";

/** Season number → episode number → catalog title. */
export type EpisodeTitleCatalog = Record<string, Record<string, string>>;

export type TvSearchHit = {
  id: number;
  name: string;
  originalName?: string;
  year?: string;
};

const MATCH_THRESHOLD = 0.72;

function foldAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function matchName(raw: string): string {
  return foldAccents(
    normalizeDiscoveryTitle(raw.replace(/\b(?:19|20)\d{2}\b/g, " "))
  );
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
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap++;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function numericKey(value: string | number): string | null {
  const raw = String(value).trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 5000) return null;
  return String(Math.floor(n));
}

export function seriesExternalIds(info: object | null | undefined): {
  tmdbId: string | null;
  imdbId: string | null;
} {
  if (!info) return { tmdbId: null, imdbId: null };
  const record = info as Record<string, unknown>;
  const tmdbRaw = record.tmdb_id ?? record.tmdb ?? record.tmdbId;
  let tmdbId: string | null = null;
  if (typeof tmdbRaw === "number" && Number.isFinite(tmdbRaw) && tmdbRaw > 0) {
    tmdbId = String(Math.floor(tmdbRaw));
  } else if (typeof tmdbRaw === "string" && /^\d+$/.test(tmdbRaw.trim()) && tmdbRaw.trim() !== "0") {
    tmdbId = tmdbRaw.trim();
  }
  let imdbId: string | null = null;
  for (const key of ["imdb_id", "imdb", "imdbId"]) {
    const value = record[key];
    if (typeof value === "string" && /^tt\d{5,}$/i.test(value.trim())) {
      imdbId = value.trim();
      break;
    }
  }
  return { tmdbId, imdbId };
}

/**
 * Pick the TV show that is actually this series. A different year is a
 * different show (The Office US vs UK), so it is not used.
 */
export function pickTvSeriesId(
  seriesName: string,
  year: string | null | undefined,
  hits: TvSearchHit[]
): number | null {
  const norm = matchName(seriesName);
  if (!norm) return null;
  let best: { id: number; score: number } | null = null;
  for (const hit of hits) {
    if (year && hit.year && year !== hit.year) continue;
    const names = [hit.name, hit.originalName].filter(
      (name): name is string => Boolean(name?.trim())
    );
    let score = 0;
    for (const name of names) {
      score = Math.max(score, titleSimilarity(norm, matchName(name)));
    }
    if (year && hit.year && year === hit.year) score += 0.08;
    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = { id: hit.id, score };
    }
  }
  return best?.id ?? null;
}

export function lookupEpisodeTitle(
  catalog: EpisodeTitleCatalog | null | undefined,
  season: string | number,
  episodeNum: string | number
): string | null {
  if (!catalog) return null;
  const seasonKey = numericKey(season);
  const episodeKey = numericKey(episodeNum);
  if (!seasonKey || !episodeKey) return null;
  const name = catalog[seasonKey]?.[episodeKey]?.trim();
  return name || null;
}

/** Prefer the catalog episode name. Keep the provider title when we have no match. */
export function displayEpisodeTitle(opts: {
  providerTitle: string;
  catalogTitle?: string | null;
  seriesName?: string | null;
}): string {
  const provider = opts.providerTitle?.trim() ?? "";
  const catalog = opts.catalogTitle?.trim() ?? "";
  if (!catalog) return provider;
  if (/^episode\s*\d+$/i.test(catalog)) return provider || catalog;
  const series = foldAccents(normalizeDiscoveryTitle(opts.seriesName ?? ""));
  if (series && foldAccents(normalizeDiscoveryTitle(catalog)) === series) {
    return provider || catalog;
  }
  return catalog;
}

export function parseSeasonList(raw: string | null | undefined): number[] {
  if (!raw?.trim()) return [];
  const seen = new Set<number>();
  const out: number[] = [];
  for (const part of raw.split(",")) {
    const n = Number(part.trim());
    if (!Number.isInteger(n) || n < 0 || n > 80 || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= 30) break;
  }
  return out;
}
