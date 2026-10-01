import type { SeriesEpisode } from "@/lib/xtream-types";

/** Parse Xtream `added` (unix sec/ms or ISO) for duplicate tie-breaking. */
export function episodeAddedMs(ep: SeriesEpisode): number {
  const raw = ep.added?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) {
    return n < 1e12 ? n * 1000 : n;
  }
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** When two rows describe the same episode, keep the newer provider entry. */
export function pickPreferredSeriesEpisode(
  a: SeriesEpisode,
  b: SeriesEpisode
): SeriesEpisode {
  const aa = episodeAddedMs(a);
  const ab = episodeAddedMs(b);
  if (aa !== ab) return aa > ab ? a : b;
  return a;
}

/**
 * Season to keep showing after a watch toggle.
 * Resume progress must not pull the list back to an earlier season.
 */
export function lockedSeriesSeason(
  seasons: readonly string[],
  manualSeason: string | null,
  activeSeason: string | null
): string | null {
  if (manualSeason != null && seasons.includes(manualSeason)) return manualSeason;
  if (activeSeason != null && seasons.includes(activeSeason)) return activeSeason;
  return seasons[0] ?? null;
}

export type SeriesListFocus = {
  season: string;
  episodeId: string;
};

/**
 * Which season tab to open. A later season the viewer already opened or
 * played wins over the default first season.
 */
export function resolveSeriesListFocus(opts: {
  seasons: readonly string[];
  manualSeason: string | null;
  storedSeason: string | null;
  recentSeason: string | null;
  resumeSeason: string | null;
}): string | null {
  const pick = (season: string | null | undefined) =>
    season && opts.seasons.includes(season) ? season : null;
  return (
    pick(opts.manualSeason) ??
    pick(opts.storedSeason) ??
    pick(opts.recentSeason) ??
    pick(opts.resumeSeason) ??
    opts.seasons[0] ??
    null
  );
}

export function seriesBrowseFocusStorageKey(
  accountKey: string,
  seriesId: number
): string {
  return `${accountKey}|series|${seriesId}`;
}

/** Sort episodes within a season by `episode_num`. */
export function compareSeriesEpisodeNum(
  a: SeriesEpisode,
  b: SeriesEpisode
): number {
  const an = Number(a.episode_num);
  const bn = Number(b.episode_num);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return String(a.episode_num).localeCompare(String(b.episode_num), undefined, {
    numeric: true,
  });
}

export function sortSeriesEpisodes(episodes: SeriesEpisode[]): SeriesEpisode[] {
  return [...episodes].sort(compareSeriesEpisodeNum);
}

/**
 * Remove duplicate rows panels often return in `get_series_info`.
 * First by stream `id`, then by `episode_num` within the season.
 */
export function dedupeSeriesEpisodes(episodes: SeriesEpisode[]): {
  episodes: SeriesEpisode[];
  stripped: number;
} {
  const out: SeriesEpisode[] = [];
  const idIndex = new Map<string, number>();
  const numIndex = new Map<string, number>();
  let stripped = 0;

  for (const ep of episodes) {
    const id = String(ep.id ?? "").trim();
    const num = String(ep.episode_num ?? "").trim();

    if (id && idIndex.has(id)) {
      stripped += 1;
      const idx = idIndex.get(id)!;
      out[idx] = pickPreferredSeriesEpisode(out[idx]!, ep);
      continue;
    }
    if (num && numIndex.has(num)) {
      stripped += 1;
      const idx = numIndex.get(num)!;
      const preferred = pickPreferredSeriesEpisode(out[idx]!, ep);
      out[idx] = preferred;
      const pid = String(preferred.id ?? "").trim();
      if (pid) idIndex.set(pid, idx);
      continue;
    }

    const idx = out.length;
    out.push(ep);
    if (id) idIndex.set(id, idx);
    if (num) numIndex.set(num, idx);
  }

  return { episodes: out, stripped };
}

/** Dedupe and sort every season bucket from a provider `episodes` map. */
export function normalizeSeriesEpisodesMap(
  raw: Record<string, SeriesEpisode[]>,
  opts?: { seriesId?: number; log?: boolean }
): { episodes: Record<string, SeriesEpisode[]>; stripped: number } {
  const episodes: Record<string, SeriesEpisode[]> = {};
  let stripped = 0;

  for (const [seasonKey, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    const { episodes: deduped, stripped: n } = dedupeSeriesEpisodes(list);
    stripped += n;
    episodes[seasonKey] = sortSeriesEpisodes(deduped);
  }

  if (opts?.log !== false && stripped > 0 && typeof console !== "undefined") {
    const sid =
      opts?.seriesId != null ? ` series=${opts.seriesId}` : "";
    console.warn(
      `[series-info]${sid} stripped ${stripped} duplicate episode row(s)`
    );
  }

  return { episodes, stripped };
}
