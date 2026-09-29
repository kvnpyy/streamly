import { extractYear, normalizeDiscoveryTitle } from "@/lib/discovery/normalize-title";

export type TmdbCollectionPart = {
  tmdbId: number;
  title: string;
  originalTitle?: string;
  year?: string;
  posterUrl?: string | null;
};

export type CollectionCatalogMovie = {
  streamId: number;
  name: string;
  year?: string;
  icon?: string;
  containerExtension?: string;
  directSource?: string;
  adult?: boolean;
};

export type CollectionRelation = "prequel" | "current" | "sequel" | "related";

export type MatchedCollectionPart = {
  tmdbId: number;
  title: string;
  year?: string;
  posterUrl?: string | null;
  streamId: number;
  catalogName: string;
  catalogIcon?: string;
  containerExtension?: string;
  directSource?: string;
  isCurrent: boolean;
  relation: CollectionRelation;
};

const RELEASE_NOISE =
  /\b(1080p|720p|2160p|480p|bluray|blu ray|brrip|bdrip|webrip|web dl|webdl|hdtv|dvdrip|x264|x265|h264|h265|hevc|aac|dts|extended|remastered|proper|repack|multi|dual audio)\b/gi;

/** Title used to pair a TMDB film with a library row. Release years and encode tags are dropped. */
export function collectionTitleCore(raw: string): string {
  let n = normalizeDiscoveryTitle(raw).replace(RELEASE_NOISE, " ").replace(/\s+/g, " ").trim();
  const year = extractYear(n);
  if (year) {
    const without = n.replace(new RegExp(`\\b${year}\\b`), " ").replace(/\s+/g, " ").trim();
    if (without.length >= 2) n = without;
  }
  return n;
}

function yearsCompatible(partYear: string | undefined, catalogYear: string | undefined): boolean {
  if (!partYear || !catalogYear) return true;
  const a = Number(partYear);
  const b = Number(catalogYear);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return true;
  return Math.abs(a - b) <= 1;
}

function partCores(part: TmdbCollectionPart): string[] {
  const cores = [collectionTitleCore(part.title)];
  if (part.originalTitle) cores.push(collectionTitleCore(part.originalTitle));
  return cores.filter((c) => c.length >= 2);
}

type IndexedMovie = CollectionCatalogMovie & { core: string };

function indexCatalog(catalog: readonly CollectionCatalogMovie[]): IndexedMovie[] {
  const out: IndexedMovie[] = [];
  for (const movie of catalog) {
    const core = collectionTitleCore(movie.name);
    if (core.length < 2) continue;
    out.push({ ...movie, core });
  }
  return out;
}

function pickCatalogMatch(
  part: TmdbCollectionPart,
  indexed: readonly IndexedMovie[],
  used: Set<number>
): IndexedMovie | null {
  const cores = partCores(part);
  if (cores.length === 0) return null;
  let best: IndexedMovie | null = null;
  let bestScore = -1;
  for (const movie of indexed) {
    if (used.has(movie.streamId)) continue;
    if (!cores.includes(movie.core)) continue;
    if (!yearsCompatible(part.year, movie.year ?? extractYear(movie.name))) continue;
    let score = 1;
    const movieYear = movie.year ?? extractYear(movie.name);
    if (part.year && movieYear && part.year === movieYear) score += 2;
    else if (part.year && movieYear) score += 1;
    if (!best || score > bestScore || (score === bestScore && movie.name.length < best.name.length)) {
      best = movie;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Library copies of a TMDB collection, in release order.
 * A part is included only when the title (and year, when both sides have one) match.
 */
function matchedFromHit(
  part: TmdbCollectionPart,
  hit: CollectionCatalogMovie,
  isCurrent: boolean
): Omit<MatchedCollectionPart, "relation"> {
  return {
    tmdbId: part.tmdbId,
    title: part.title,
    year: part.year ?? hit.year ?? extractYear(hit.name),
    posterUrl: part.posterUrl,
    streamId: hit.streamId,
    catalogName: hit.name,
    catalogIcon: hit.icon,
    containerExtension: hit.containerExtension,
    directSource: hit.directSource,
    isCurrent,
  };
}

export function matchCollectionParts(opts: {
  parts: readonly TmdbCollectionPart[];
  catalog: readonly CollectionCatalogMovie[];
  currentStreamId?: number;
  /** TMDB id of the movie on screen, so a messy library title still anchors "next". */
  currentTmdbId?: number;
  hideAdult?: boolean;
}): MatchedCollectionPart[] {
  const catalog = opts.hideAdult
    ? opts.catalog.filter((m) => !m.adult)
    : opts.catalog;
  const indexed = indexCatalog(catalog);
  const used = new Set<number>();
  const matched: Omit<MatchedCollectionPart, "relation">[] = [];

  for (const part of opts.parts) {
    const hit = pickCatalogMatch(part, indexed, used);
    if (!hit) continue;
    used.add(hit.streamId);
    const isCurrent =
      opts.currentStreamId != null && hit.streamId === opts.currentStreamId;
    matched.push(matchedFromHit(part, hit, isCurrent));
  }

  const currentMovie =
    opts.currentStreamId != null
      ? opts.catalog.find((m) => m.streamId === opts.currentStreamId)
      : undefined;
  const currentPart =
    opts.currentTmdbId != null
      ? opts.parts.find((p) => p.tmdbId === opts.currentTmdbId)
      : undefined;
  if (
    currentMovie &&
    currentPart &&
    !matched.some((p) => p.streamId === currentMovie.streamId)
  ) {
    const withoutPart = matched.filter((p) => p.tmdbId !== currentPart.tmdbId);
    const pinned = matchedFromHit(currentPart, currentMovie, true);
    const insertAt = opts.parts.findIndex((p) => p.tmdbId === currentPart.tmdbId);
    let placed = false;
    const next: typeof matched = [];
    for (const row of withoutPart) {
      if (!placed) {
        const rowAt = opts.parts.findIndex((p) => p.tmdbId === row.tmdbId);
        if (rowAt > insertAt) {
          next.push(pinned);
          placed = true;
        }
      }
      next.push(row);
    }
    if (!placed) next.push(pinned);
    matched.splice(0, matched.length, ...next);
  } else if (currentMovie) {
    for (const row of matched) {
      row.isCurrent = row.streamId === currentMovie.streamId;
    }
  }

  const currentIndex = matched.findIndex((p) => p.isCurrent);
  return matched.map((part, index) => ({
    ...part,
    relation:
      currentIndex < 0
        ? "related"
        : index < currentIndex
          ? "prequel"
          : index > currentIndex
            ? "sequel"
            : "current",
  }));
}

export function nextCollectionMovie(
  parts: readonly MatchedCollectionPart[]
): MatchedCollectionPart | null {
  const index = parts.findIndex((p) => p.isCurrent);
  if (index < 0) return null;
  return parts[index + 1] ?? null;
}

export type MovieCollectionResponse = {
  collectionName: string | null;
  parts: MatchedCollectionPart[];
};

export function collectionHasOtherTitles(
  parts: readonly MatchedCollectionPart[]
): boolean {
  return parts.some((p) => !p.isCurrent);
}
