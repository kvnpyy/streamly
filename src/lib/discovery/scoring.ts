import type { MediaShelfItem } from "@/components/MediaShelf";
import { isSpamLiveListing } from "@/lib/discovery/live-quality";
import {
  catalogTitleEntriesFromMovies,
  catalogTitleEntriesFromSeries,
  matchTmdbTrendingToCatalog,
} from "@/lib/discovery/tmdb-match";
import type { TmdbTrendingItem } from "@/lib/discovery/types";
import { parseChannelMeta } from "@/lib/channel-meta";
import { looksAdult, parsePositiveRouteId } from "@/lib/utils";
import type { LiveStream, SeriesItem, VodStream } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";

type SafeFilterOpts = {
  hideAdult: boolean;
  parentalUnlocked: boolean;
};

function vodIsSafe(
  m: VodStream,
  { hideAdult, parentalUnlocked }: SafeFilterOpts
): boolean {
  if (!hideAdult || parentalUnlocked) return true;
  return !looksAdult({ name: m.name, is_adult: m.is_adult });
}

function seriesIsSafe(
  s: SeriesItem,
  { hideAdult, parentalUnlocked }: SafeFilterOpts
): boolean {
  if (!hideAdult || parentalUnlocked) return true;
  return !looksAdult({ name: s.name });
}

function movieToShelfItem(
  m: VodStream,
  mid: number,
  isFavorite: (id: number) => boolean,
  toggleFavorite: (m: VodStream, mid: number) => void
): MediaShelfItem {
  return {
    id: mid,
    href: `/app/movies/${mid}`,
    poster: m.stream_icon,
    title: m.name,
    subtitle: m.year,
    rating: m.rating,
    isFavorite: isFavorite(mid),
    onToggleFavorite: () => toggleFavorite(m, mid),
  };
}

function seriesToShelfItem(
  s: SeriesItem,
  sid: number,
  isFavorite: (id: number) => boolean,
  toggleFavorite: (s: SeriesItem, sid: number) => void
): MediaShelfItem {
  return {
    id: sid,
    href: `/app/series/${sid}`,
    poster: s.cover,
    title: s.name,
    subtitle: s.year,
    rating: s.rating,
    isFavorite: isFavorite(sid),
    onToggleFavorite: () => toggleFavorite(s, sid),
  };
}

export function buildTopRatedMovies(
  movies: VodStream[],
  opts: SafeFilterOpts & {
    isFavorite: (id: number) => boolean;
    toggleFavorite: (m: VodStream, mid: number) => void;
    limit?: number;
    minRating?: number;
  }
): MediaShelfItem[] {
  const minRating = opts.minRating ?? 6;
  const byId = new Map<number, VodStream>();
  for (const m of movies) {
    const mid = parsePositiveRouteId(m.stream_id);
    if (mid == null || !vodIsSafe(m, opts)) continue;
    if ((parseFloat(m.rating || "0") || 0) < minRating) continue;
    byId.set(mid, m);
  }
  return [...byId.values()]
    .sort(
      (a, b) =>
        (parseFloat(b.rating || "0") || 0) - (parseFloat(a.rating || "0") || 0)
    )
    .slice(0, opts.limit ?? 24)
    .map((m) => {
      const mid = parsePositiveRouteId(m.stream_id)!;
      return movieToShelfItem(m, mid, opts.isFavorite, opts.toggleFavorite);
    });
}

export function buildNewMovies(
  movies: VodStream[],
  opts: SafeFilterOpts & {
    isFavorite: (id: number) => boolean;
    toggleFavorite: (m: VodStream, mid: number) => void;
    limit?: number;
  }
): MediaShelfItem[] {
  const list = movies
    .filter((m) => {
      if (parsePositiveRouteId(m.stream_id) == null) return false;
      return vodIsSafe(m, opts);
    })
    .slice()
    .sort((a, b) => {
      const ad = parseInt(a.added || "0", 10) || 0;
      const bd = parseInt(b.added || "0", 10) || 0;
      return bd - ad;
    })
    .slice(0, opts.limit ?? 24);

  return list.map((m) => {
    const mid = parsePositiveRouteId(m.stream_id)!;
    return movieToShelfItem(m, mid, opts.isFavorite, opts.toggleFavorite);
  });
}

export function buildTopRatedSeries(
  series: SeriesItem[],
  opts: SafeFilterOpts & {
    isFavorite: (id: number) => boolean;
    toggleFavorite: (s: SeriesItem, sid: number) => void;
    limit?: number;
    minRating?: number;
  }
): MediaShelfItem[] {
  const minRating = opts.minRating ?? 6;
  return series
    .filter((s) => {
      if (parsePositiveRouteId(s.series_id) == null) return false;
      if (!seriesIsSafe(s, opts)) return false;
      return (parseFloat(s.rating || "0") || 0) >= minRating;
    })
    .sort(
      (a, b) =>
        (parseFloat(b.rating || "0") || 0) - (parseFloat(a.rating || "0") || 0)
    )
    .slice(0, opts.limit ?? 24)
    .map((s) => {
      const sid = parsePositiveRouteId(s.series_id)!;
      return seriesToShelfItem(s, sid, opts.isFavorite, opts.toggleFavorite);
    });
}

export function buildNewSeries(
  series: SeriesItem[],
  opts: SafeFilterOpts & {
    isFavorite: (id: number) => boolean;
    toggleFavorite: (s: SeriesItem, sid: number) => void;
    limit?: number;
  }
): MediaShelfItem[] {
  return series
    .filter((s) => {
      if (parsePositiveRouteId(s.series_id) == null) return false;
      return seriesIsSafe(s, opts);
    })
    .slice()
    .sort((a, b) => {
      const ad = parseInt(a.last_modified || "0", 10) || 0;
      const bd = parseInt(b.last_modified || "0", 10) || 0;
      return bd - ad;
    })
    .slice(0, opts.limit ?? 24)
    .map((s) => {
      const sid = parsePositiveRouteId(s.series_id)!;
      return seriesToShelfItem(s, sid, opts.isFavorite, opts.toggleFavorite);
    });
}

export function buildTmdbTrendingMovies(
  movies: VodStream[],
  trending: TmdbTrendingItem[],
  opts: SafeFilterOpts & {
    isFavorite: (id: number) => boolean;
    toggleFavorite: (m: VodStream, mid: number) => void;
    limit?: number;
  }
): MediaShelfItem[] {
  if (trending.length === 0) return [];
  const safe = movies.filter((m) => {
    if (parsePositiveRouteId(m.stream_id) == null) return false;
    return vodIsSafe(m, opts);
  });
  const catalog = catalogTitleEntriesFromMovies(safe, (m) =>
    parsePositiveRouteId(m.stream_id)
  );
  const ids = matchTmdbTrendingToCatalog(
    trending,
    catalog,
    opts.limit ?? 24
  );
  const byId = new Map(
    safe.map((m) => [parsePositiveRouteId(m.stream_id)!, m] as const)
  );
  return ids
    .map((id) => {
      const m = byId.get(id);
      if (!m) return null;
      return movieToShelfItem(m, id, opts.isFavorite, opts.toggleFavorite);
    })
    .filter((x): x is MediaShelfItem => x !== null);
}

export function buildTmdbTrendingSeries(
  series: SeriesItem[],
  trending: TmdbTrendingItem[],
  opts: SafeFilterOpts & {
    isFavorite: (id: number) => boolean;
    toggleFavorite: (s: SeriesItem, sid: number) => void;
    limit?: number;
  }
): MediaShelfItem[] {
  if (trending.length === 0) return [];
  const safe = series.filter((s) => {
    if (parsePositiveRouteId(s.series_id) == null) return false;
    return seriesIsSafe(s, opts);
  });
  const catalog = catalogTitleEntriesFromSeries(safe, (s) =>
    parsePositiveRouteId(s.series_id)
  );
  const ids = matchTmdbTrendingToCatalog(trending, catalog, opts.limit ?? 24);
  const byId = new Map(
    safe.map((s) => [parsePositiveRouteId(s.series_id)!, s] as const)
  );
  return ids
    .map((id) => {
      const s = byId.get(id);
      if (!s) return null;
      return seriesToShelfItem(s, id, opts.isFavorite, opts.toggleFavorite);
    })
    .filter((x): x is MediaShelfItem => x !== null);
}

export function buildForYouMovies(
  movies: VodStream[],
  recents: RecentItem[],
  favorites: Favorite[],
  opts: SafeFilterOpts & {
    isFavorite: (id: number) => boolean;
    toggleFavorite: (m: VodStream, mid: number) => void;
    limit?: number;
  }
): MediaShelfItem[] {
  const byId = new Map<number, VodStream>();
  for (const m of movies) {
    const mid = parsePositiveRouteId(m.stream_id);
    if (mid == null || !vodIsSafe(m, opts)) continue;
    byId.set(mid, m);
  }

  const scores = new Map<number, number>();
  const bump = (id: number, amount: number) => {
    scores.set(id, (scores.get(id) ?? 0) + amount);
  };

  recents
    .filter((r) => r.kind === "movie")
    .forEach((r, i) => bump(r.id, 40 - Math.min(i, 20)));
  favorites
    .filter((f) => f.kind === "movie")
    .forEach((f) => bump(f.id, 25));

  const ranked = [...scores.entries()]
    .filter(([id]) => byId.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.limit ?? 18);

  return ranked.map(([id]) => {
    const m = byId.get(id)!;
    return movieToShelfItem(m, id, opts.isFavorite, opts.toggleFavorite);
  });
}

export function buildForYouSeries(
  series: SeriesItem[],
  recents: RecentItem[],
  favorites: Favorite[],
  opts: SafeFilterOpts & {
    isFavorite: (id: number) => boolean;
    toggleFavorite: (s: SeriesItem, sid: number) => void;
    limit?: number;
  }
): MediaShelfItem[] {
  const byId = new Map<number, SeriesItem>();
  for (const s of series) {
    const sid = parsePositiveRouteId(s.series_id);
    if (sid == null || !seriesIsSafe(s, opts)) continue;
    byId.set(sid, s);
  }

  const scores = new Map<number, number>();
  const bump = (id: number, amount: number) => {
    scores.set(id, (scores.get(id) ?? 0) + amount);
  };

  recents
    .filter((r) => r.kind === "series")
    .forEach((r, i) => bump(r.id, 40 - Math.min(i, 20)));
  favorites
    .filter((f) => f.kind === "series")
    .forEach((f) => bump(f.id, 25));

  const ranked = [...scores.entries()]
    .filter(([id]) => byId.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.limit ?? 18);

  return ranked.map(([id]) => {
    const s = byId.get(id)!;
    return seriesToShelfItem(s, id, opts.isFavorite, opts.toggleFavorite);
  });
}

function channelHasMajorNetwork(name: string): boolean {
  const meta = parseChannelMeta(name);
  return Boolean(meta.network);
}

/**
 * Quick picks for live discovery fallback — excludes recents (shown in Continue watching).
 * Favorites first, then major-network channels, then the rest alphabetically.
 */
export function buildFeaturedLive(
  channels: LiveStream[],
  recents: RecentItem[],
  favorites: Favorite[],
  opts: SafeFilterOpts & { limit?: number }
): LiveStream[] {
  const safe = channels.filter((c) => {
    if (isSpamLiveListing(c.name)) return false;
    if (!opts.hideAdult || opts.parentalUnlocked) return true;
    return !looksAdult({ name: c.name, is_adult: c.is_adult });
  });

  const recentIds = new Set(
    recents.filter((r) => r.kind === "live").map((r) => r.id)
  );
  const favIds = favorites
    .filter((f) => f.kind === "live")
    .map((f) => f.id);

  const byId = new Map(safe.map((c) => [c.stream_id, c]));
  const ordered: LiveStream[] = [];
  const seen = new Set<number>();

  const push = (id: number) => {
    if (seen.has(id) || recentIds.has(id)) return;
    const ch = byId.get(id);
    if (!ch) return;
    seen.add(id);
    ordered.push(ch);
  };

  for (const id of favIds) push(id);

  const networkChannels = safe
    .filter((c) => !recentIds.has(c.stream_id) && channelHasMajorNetwork(c.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const ch of networkChannels) {
    push(ch.stream_id);
    if (ordered.length >= (opts.limit ?? 12)) break;
  }

  for (const ch of [...safe].sort((a, b) => a.name.localeCompare(b.name))) {
    push(ch.stream_id);
    if (ordered.length >= (opts.limit ?? 12)) break;
  }

  return ordered.slice(0, opts.limit ?? 12);
}
