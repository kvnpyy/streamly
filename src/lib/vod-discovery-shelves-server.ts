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
} from "@/lib/discovery/scoring";
import type { TmdbTrendingItem } from "@/lib/discovery/types";
import { buildProviderGenreShelves } from "@/lib/vod-genre-discovery";
import type {
  GenreDiscoveryShelfDto,
  SeriesDiscoveryShelvesPayload,
  VodDiscoveryShelfItemDto,
  VodDiscoveryShelvesPayload,
} from "@/lib/vod-discovery-shelves-types";
import type { SeriesCatalogBundle, VodCatalogBundle } from "@/lib/vod-catalog-bundle";
import { looksAdult } from "@/lib/utils";
import type { Category, SeriesItem, VodStream } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";

const noopFav = () => false;
const noopMovieToggle = () => {};
const noopSeriesToggle = () => {};

export type VodDiscoveryShelvesOpts = {
  hideAdult: boolean;
  parentalUnlocked: boolean;
  recentIds: number[];
  favoriteIds: number[];
  movieTrending: TmdbTrendingItem[];
  tvTrending: TmdbTrendingItem[];
  maxGenreShelves?: number;
};

function movieDto(m: VodStream, mid: number): VodDiscoveryShelfItemDto {
  return {
    id: mid,
    href: `/app/movies/${mid}`,
    poster: m.stream_icon,
    title: m.name,
    subtitle: m.year,
    rating: m.rating,
    container_extension: m.container_extension,
  };
}

function seriesDto(s: SeriesItem, sid: number): VodDiscoveryShelfItemDto {
  return {
    id: sid,
    href: `/app/series/${sid}`,
    poster: s.cover,
    title: s.name,
    subtitle: s.year,
    rating: s.rating,
  };
}

function stripMovieShelf(items: MediaShelfItem[]): VodDiscoveryShelfItemDto[] {
  return items.map((item) => ({
    id: item.id,
    href: item.href,
    poster: item.poster,
    title: item.title,
    subtitle: item.subtitle,
    rating: item.rating,
  }));
}

function stripSeriesShelf(items: MediaShelfItem[]): VodDiscoveryShelfItemDto[] {
  return stripMovieShelf(items);
}

function allowedCategoryIds(
  categories: Category[],
  hideAdult: boolean,
  parentalUnlocked: boolean
): Set<string> {
  return new Set(
    categories
      .filter(
        (c) =>
          !hideAdult ||
          parentalUnlocked ||
          !looksAdult({ category_name: c.category_name })
      )
      .map((c) => String(c.category_id))
  );
}

function syntheticRecents(
  kind: "movie" | "series",
  ids: number[]
): RecentItem[] {
  const now = Date.now();
  return ids.map((id, i) => ({
    kind,
    id,
    name: "",
    icon: undefined,
    addedAt: now,
    lastAt: now - i,
  }));
}

function syntheticFavorites(
  kind: "movie" | "series",
  ids: number[]
): Favorite[] {
  return ids.map((id) => ({
    kind,
    id,
    name: "",
    icon: undefined,
    addedAt: Date.now(),
  }));
}

function buildGenreShelvesDto(
  shelves: ReturnType<typeof buildProviderGenreShelves>
): GenreDiscoveryShelfDto[] {
  return shelves.map((shelf) => ({
    categoryId: shelf.categoryId,
    title: shelf.title,
    items: shelf.items.map((item) => ({
      id: item.id,
      href: item.href,
      poster: item.poster,
      title: item.title,
      subtitle: item.subtitle,
      rating: item.rating,
    })),
  }));
}

export function buildVodDiscoveryShelvesPayload(
  bundle: VodCatalogBundle,
  opts: VodDiscoveryShelvesOpts
): VodDiscoveryShelvesPayload {
  const movies = bundle.streams ?? [];
  const safeOpts = {
    hideAdult: opts.hideAdult,
    parentalUnlocked: opts.parentalUnlocked,
    isFavorite: noopFav,
    toggleFavorite: noopMovieToggle,
  };
  const allowedCatIds = allowedCategoryIds(
    bundle.categories ?? [],
    opts.hideAdult,
    opts.parentalUnlocked
  );
  const recents = syntheticRecents("movie", opts.recentIds);
  const favorites = syntheticFavorites("movie", opts.favoriteIds);

  const topRated = stripMovieShelf(
    buildTopRatedMovies(movies, safeOpts)
  );
  const newlyAdded = stripMovieShelf(buildNewMovies(movies, safeOpts));
  const forYou = stripMovieShelf(
    buildForYouMovies(movies, recents, favorites, safeOpts)
  );
  const trending =
    opts.movieTrending.length > 0
      ? stripMovieShelf(
          buildTmdbTrendingMovies(movies, opts.movieTrending, safeOpts)
        )
      : [];

  const genreShelves = buildGenreShelvesDto(
    buildProviderGenreShelves({
      kind: "movie",
      categories: bundle.categories ?? [],
      countById: bundle.countByCategoryId ?? {},
      streams: movies,
      allowedCatIds,
      hideAdult: opts.hideAdult,
      parentalUnlocked: opts.parentalUnlocked,
      isFavorite: noopFav,
      toggleFavorite: () => {},
      maxShelves: opts.maxGenreShelves ?? 6,
    })
  );

  return {
    topRated,
    newlyAdded,
    forYou,
    trending,
    genreShelves,
    trendingSynced: opts.movieTrending.length > 0,
  };
}

export function buildSeriesDiscoveryShelvesPayload(
  bundle: SeriesCatalogBundle,
  opts: VodDiscoveryShelvesOpts
): SeriesDiscoveryShelvesPayload {
  const series = bundle.streams ?? [];
  const safeOpts = {
    hideAdult: opts.hideAdult,
    parentalUnlocked: opts.parentalUnlocked,
    isFavorite: noopFav,
    toggleFavorite: noopSeriesToggle,
  };
  const allowedCatIds = allowedCategoryIds(
    bundle.categories ?? [],
    opts.hideAdult,
    opts.parentalUnlocked
  );
  const recents = syntheticRecents("series", opts.recentIds);
  const favorites = syntheticFavorites("series", opts.favoriteIds);

  const topRated = stripSeriesShelf(buildTopRatedSeries(series, safeOpts));
  const newlyAdded = stripSeriesShelf(buildNewSeries(series, safeOpts));
  const forYou = stripSeriesShelf(
    buildForYouSeries(series, recents, favorites, safeOpts)
  );
  const trending =
    opts.tvTrending.length > 0
      ? stripSeriesShelf(
          buildTmdbTrendingSeries(series, opts.tvTrending, safeOpts)
        )
      : [];

  const genreShelves = buildGenreShelvesDto(
    buildProviderGenreShelves({
      kind: "series",
      categories: bundle.categories ?? [],
      countById: bundle.countByCategoryId ?? {},
      streams: series,
      allowedCatIds,
      hideAdult: opts.hideAdult,
      parentalUnlocked: opts.parentalUnlocked,
      isFavorite: noopFav,
      toggleFavorite: () => {},
      maxShelves: opts.maxGenreShelves ?? 6,
    })
  );

  return {
    topRated,
    newlyAdded,
    forYou,
    trending,
    genreShelves,
    trendingSynced: opts.tvTrending.length > 0,
  };
}

/** Re-export for tests that need play metadata on DTO rows. */
export { movieDto, seriesDto };
