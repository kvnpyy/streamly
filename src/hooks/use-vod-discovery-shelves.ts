"use client";

import type { MediaShelfItem } from "@/components/MediaShelf";
import {
  buildForYouMovies,
  buildForYouSeries,
  buildNewMovies,
  buildNewSeries,
  buildTmdbTrendingMovies,
  buildTmdbTrendingSeries,
  buildTopRatedMovies,
  buildTopRatedSeries,
  isDiscoveryShelvesEnabled,
} from "@/lib/discovery";
import { DISCOVERY_SHELF_META } from "@/lib/discovery/shelf-meta";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import { useMemo } from "react";
import { useDiscoveryTmdb } from "@/hooks/use-discovery-tmdb";

type MovieShelfOpts = {
  hideAdult: boolean;
  parentalUnlocked: boolean;
  isFavorite: (kind: "movie" | "series", id: number) => boolean;
  toggleFavoriteMovie: (m: VodStream, mid: number) => void;
};

type SeriesShelfOpts = {
  hideAdult: boolean;
  parentalUnlocked: boolean;
  isFavorite: (kind: "movie" | "series", id: number) => boolean;
  toggleFavoriteSeries: (s: SeriesItem, sid: number) => void;
};

export function useMovieDiscoveryShelves(
  movies: VodStream[] | undefined,
  recents: RecentItem[],
  favorites: Favorite[],
  opts: MovieShelfOpts,
  region = "US"
) {
  const discovery = useDiscoveryTmdb(region);
  const enabled = isDiscoveryShelvesEnabled();
  const safeOpts = {
    hideAdult: opts.hideAdult,
    parentalUnlocked: opts.parentalUnlocked,
  };

  return useMemo(() => {
    const list = movies ?? [];
    const movieFav = (id: number) => opts.isFavorite("movie", id);
    const toggleMovie = opts.toggleFavoriteMovie;

    const topRated = buildTopRatedMovies(list, {
      ...safeOpts,
      isFavorite: movieFav,
      toggleFavorite: toggleMovie,
    });
    const newlyAdded = buildNewMovies(list, {
      ...safeOpts,
      isFavorite: movieFav,
      toggleFavorite: toggleMovie,
    });
    const forYou = enabled
      ? buildForYouMovies(list, recents, favorites, {
          ...safeOpts,
          isFavorite: movieFav,
          toggleFavorite: toggleMovie,
        })
      : [];
    const trending =
      enabled && discovery.data?.movieTrending?.length
        ? buildTmdbTrendingMovies(list, discovery.data.movieTrending, {
            ...safeOpts,
            isFavorite: movieFav,
            toggleFavorite: toggleMovie,
          })
        : [];

    return {
      topRated,
      newlyAdded,
      forYou,
      trending,
      trendingLoading: enabled && discovery.isLoading,
      meta: DISCOVERY_SHELF_META,
    };
  }, [
    movies,
    recents,
    favorites,
    opts.hideAdult,
    opts.parentalUnlocked,
    opts.isFavorite,
    opts.toggleFavoriteMovie,
    enabled,
    discovery.data,
    discovery.isLoading,
  ]);
}

export function useSeriesDiscoveryShelves(
  series: SeriesItem[] | undefined,
  recents: RecentItem[],
  favorites: Favorite[],
  opts: SeriesShelfOpts,
  region = "US"
) {
  const discovery = useDiscoveryTmdb(region);
  const enabled = isDiscoveryShelvesEnabled();

  const safeOpts = {
    hideAdult: opts.hideAdult,
    parentalUnlocked: opts.parentalUnlocked,
  };

  return useMemo(() => {
    const list = series ?? [];
    const seriesFav = (id: number) => opts.isFavorite("series", id);
    const toggleSeries = opts.toggleFavoriteSeries;

    const topRated = buildTopRatedSeries(list, {
      ...safeOpts,
      isFavorite: seriesFav,
      toggleFavorite: toggleSeries,
    });
    const newlyAdded = buildNewSeries(list, {
      ...safeOpts,
      isFavorite: seriesFav,
      toggleFavorite: toggleSeries,
    });
    const forYou = enabled
      ? buildForYouSeries(list, recents, favorites, {
          ...safeOpts,
          isFavorite: seriesFav,
          toggleFavorite: toggleSeries,
        })
      : [];
    const trending =
      enabled && discovery.data?.tvTrending?.length
        ? buildTmdbTrendingSeries(list, discovery.data.tvTrending, {
            ...safeOpts,
            isFavorite: seriesFav,
            toggleFavorite: toggleSeries,
          })
        : [];

    return {
      topRated,
      newlyAdded,
      forYou,
      trending,
      trendingLoading: enabled && discovery.isLoading,
      meta: DISCOVERY_SHELF_META,
    };
  }, [
    series,
    recents,
    favorites,
    opts.hideAdult,
    opts.parentalUnlocked,
    opts.isFavorite,
    opts.toggleFavoriteSeries,
    enabled,
    discovery.data,
    discovery.isLoading,
  ]);
}

/** Compact home rows (12 items). */
export function sliceShelfItems(items: MediaShelfItem[], limit = 12) {
  return items.slice(0, limit);
}
