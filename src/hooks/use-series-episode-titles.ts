"use client";

import {
  displayEpisodeTitle,
  lookupEpisodeTitle,
  type EpisodeTitleCatalog,
} from "@/lib/tmdb-episode-titles";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

export function useSeriesEpisodeTitles(opts: {
  title?: string | null;
  year?: string | null;
  tmdbId?: string | null;
  imdbId?: string | null;
  seasons: string[];
  seriesName?: string | null;
}) {
  const title = opts.title?.trim() ?? "";
  const seasons = opts.seasons.filter((season) => /^\d+$/.test(season)).join(",");
  const enabled = Boolean((title || opts.tmdbId || opts.imdbId) && seasons);

  const query = useQuery({
    queryKey: ["tmdb-tv-episodes", opts.tmdbId, opts.imdbId, title, opts.year, seasons],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ seasons });
      if (opts.tmdbId) params.set("tmdbId", opts.tmdbId);
      if (opts.imdbId) params.set("imdbId", opts.imdbId);
      if (title) params.set("title", title);
      if (opts.year) params.set("year", opts.year);
      const res = await fetch(`/api/tmdb/tv-episodes?${params}`, { signal });
      if (!res.ok) return { episodes: {} as EpisodeTitleCatalog };
      const data = (await res.json()) as { episodes?: EpisodeTitleCatalog };
      return { episodes: data.episodes ?? {} };
    },
    enabled,
    staleTime: 86_400_000,
  });

  const catalog = query.data?.episodes;
  const seriesName = opts.seriesName ?? title;

  const titleFor = useCallback(
    (season: string, episodeNum: string | number, providerTitle: string) =>
      displayEpisodeTitle({
        providerTitle,
        catalogTitle: lookupEpisodeTitle(catalog, season, episodeNum),
        seriesName,
      }),
    [catalog, seriesName]
  );

  return titleFor;
}
