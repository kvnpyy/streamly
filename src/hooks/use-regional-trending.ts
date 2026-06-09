"use client";

import {
  appendCatalogFallbacks,
  buildRegionalTrending,
  liveEntriesToTrendingCards,
  shouldShowRegionalTrending,
  vodShelfToTrendingCards,
} from "@/lib/discovery/regional-trending";
import { isSpamLiveListing } from "@/lib/discovery/live-quality";
import { regionalTrendingShelfMeta } from "@/lib/discovery/shelf-meta";
import {
  buildNewSeries,
  buildTopRatedMovies,
  buildTmdbTrendingMovies,
  buildTmdbTrendingSeries,
  isDiscoveryShelvesEnabled,
} from "@/lib/discovery";
import { resolveTmdbCountry } from "@/lib/discovery/tmdb-region";
import type { TvRegion } from "@/lib/geo-continent";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import type { RegionalTrendingCard } from "@/lib/discovery/regional-trending-types";
import type { LiveStream, SeriesItem, VodStream } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import { tvRegionalTrendingMinItems } from "@/lib/tv-playback-tune";
import { useDiscoveryTmdb } from "@/hooks/use-discovery-tmdb";
import { useMemo } from "react";

type UseRegionalTrendingOpts = {
  movies: VodStream[] | undefined;
  series: SeriesItem[] | undefined;
  liveChannels?: LiveStream[];
  recents?: RecentItem[];
  favorites?: Favorite[];
  sportsEvents: ScoredLiveEntry[];
  trendingOnTv?: ScoredLiveEntry[];
  onNow: ScoredLiveEntry[];
  tonight: ScoredLiveEntry[];
  epgLoading?: boolean;
  vodLoading?: boolean;
  hideAdult: boolean;
  parentalUnlocked: boolean;
  isFavorite: (kind: "movie" | "series" | "live", id: number) => boolean;
  toggleFavoriteMovie: (m: VodStream, mid: number) => void;
  toggleFavoriteSeries: (s: SeriesItem, sid: number) => void;
  /** TV browse continent — drives TMDB country code. */
  tvRegion?: TvRegion | null;
  region?: string;
  enabled?: boolean;
  livingRoom?: boolean;
};

function filterTrendingCards(items: RegionalTrendingCard[]): RegionalTrendingCard[] {
  return items.filter((card) => {
    if (card.kind !== "live" || !card.stream) return true;
    return !isSpamLiveListing(card.title, card.liveEntry?.programmeTitle);
  });
}

function isQualityTrendingShelf(items: RegionalTrendingCard[]): boolean {
  const vodCount = items.filter((c) => c.kind === "movie" || c.kind === "series").length;
  if (vodCount >= 2) return true;
  const liveOk = items.filter(
    (c) =>
      c.kind === "live" &&
      c.stream &&
      !isSpamLiveListing(c.title, c.liveEntry?.programmeTitle)
  );
  return liveOk.length >= 2 && vodCount >= 1;
}

export function useRegionalTrending({
  movies,
  series,
  sportsEvents,
  trendingOnTv = [],
  onNow,
  tonight,
  epgLoading = false,
  vodLoading = false,
  hideAdult,
  parentalUnlocked,
  isFavorite,
  toggleFavoriteMovie,
  toggleFavoriteSeries,
  tvRegion = null,
  region: regionOverride,
  enabled = true,
  livingRoom = false,
}: UseRegionalTrendingOpts) {
  const tmdbCountry =
    regionOverride?.trim().toUpperCase() ||
    resolveTmdbCountry({ tvRegion });
  const discoveryOn = isDiscoveryShelvesEnabled() && enabled;
  const discovery = useDiscoveryTmdb(tvRegion);
  const minItems = livingRoom ? tvRegionalTrendingMinItems() : undefined;

  const safeOpts = { hideAdult, parentalUnlocked };

  return useMemo(() => {
    const meta = regionalTrendingShelfMeta(tmdbCountry);
    if (!discoveryOn) {
      return {
        items: [],
        show: false,
        loading: false,
        meta,
        minItems: minItems ?? 4,
      };
    }

    const movieList = movies ?? [];
    const seriesList = series ?? [];
    const movieTrendingRaw = discovery.data?.movieTrending ?? [];
    const tvTrendingRaw = discovery.data?.tvTrending ?? [];
    const catalogReady = movieList.length > 0 || seriesList.length > 0;
    const tmdbListsReady =
      !discovery.isLoading &&
      (movieTrendingRaw.length > 0 || tvTrendingRaw.length > 0);

    const tmdbMovies =
      movieTrendingRaw.length > 0 && catalogReady
        ? buildTmdbTrendingMovies(movieList, movieTrendingRaw, {
            ...safeOpts,
            isFavorite: (id) => isFavorite("movie", id),
            toggleFavorite: toggleFavoriteMovie,
            limit: 12,
          })
        : [];

    const tmdbSeries =
      tvTrendingRaw.length > 0 && catalogReady
        ? buildTmdbTrendingSeries(seriesList, tvTrendingRaw, {
            ...safeOpts,
            isFavorite: (id) => isFavorite("series", id),
            toggleFavorite: toggleFavoriteSeries,
            limit: 12,
          })
        : [];

    const tmdbMoviePopularity = movieTrendingRaw
      .slice(0, tmdbMovies.length)
      .map((t) => t.popularity);
    const tmdbSeriesPopularity = tvTrendingRaw
      .slice(0, tmdbSeries.length)
      .map((t) => t.popularity);

    let items = filterTrendingCards(
      buildRegionalTrending({
        region: tmdbCountry,
        tmdbMovies,
        tmdbSeries,
        tmdbMoviePopularity,
        tmdbSeriesPopularity,
        sportsEvents,
        trendingOnTv,
        onNow,
        tonight,
        limit: livingRoom ? 10 : 14,
      })
    );

    const threshold = minItems ?? 4;

    if (items.length < threshold && catalogReady) {
      const topMovies = buildTopRatedMovies(movieList, {
        ...safeOpts,
        isFavorite: (id) => isFavorite("movie", id),
        toggleFavorite: toggleFavoriteMovie,
        limit: 6,
        minRating: 0,
      });
      const newSeries = buildNewSeries(seriesList, {
        ...safeOpts,
        isFavorite: (id) => isFavorite("series", id),
        toggleFavorite: toggleFavoriteSeries,
        limit: 4,
      });

      const fallbacks = [
        ...vodShelfToTrendingCards(
          topMovies,
          "movie",
          "catalog_top_movie",
          28
        ),
        ...vodShelfToTrendingCards(
          newSeries,
          "series",
          "catalog_new_series",
          26
        ),
      ];
      items = filterTrendingCards(
        appendCatalogFallbacks(items, fallbacks, threshold, 10)
      );
    }

    const vodReady = tmdbMovies.length > 0 || tmdbSeries.length > 0;
    const quality = isQualityTrendingShelf(items);

    const waitingForCatalog = livingRoom && (vodLoading || !catalogReady);
    const waitingForTmdbMatch =
      livingRoom && catalogReady && tmdbListsReady && !vodReady;
    const waitingForGoodShelf = livingRoom && items.length > 0 && !quality;

    const loading =
      items.length < threshold
        ? waitingForCatalog ||
          waitingForTmdbMatch ||
          epgLoading ||
          (!livingRoom && discovery.isLoading && !vodReady)
        : waitingForGoodShelf;

    const showItems = loading ? [] : items;

    return {
      items: showItems,
      show: loading || shouldShowRegionalTrending(items, threshold),
      loading,
      meta,
      minItems: threshold,
    };
  }, [
    discoveryOn,
    movies,
    series,
    sportsEvents,
    trendingOnTv,
    onNow,
    tonight,
    epgLoading,
    vodLoading,
    hideAdult,
    parentalUnlocked,
    isFavorite,
    toggleFavoriteMovie,
    toggleFavoriteSeries,
    tmdbCountry,
    tvRegion,
    livingRoom,
    minItems,
    discovery.data,
    discovery.isLoading,
  ]);
}
