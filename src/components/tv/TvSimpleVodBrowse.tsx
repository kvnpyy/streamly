"use client";

import { DiscoveryShelf } from "@/components/DiscoveryShelf";
import { MediaCard } from "@/components/MediaCard";
import { MediaShelf } from "@/components/MediaShelf";
import { TvCategoryGrid } from "@/components/tv/TvCategoryGrid";
import { TvFocusRoot } from "@/components/tv/TvFocusRoot";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { useCatalogPlay } from "@/hooks/use-catalog-play";
import { useCatalogPageReady } from "@/hooks/use-catalog-page-ready";
import {
  attachMovieDiscoveryShelfItems,
  attachSeriesDiscoveryShelfItems,
} from "@/lib/attach-discovery-shelf-items";
import { DISCOVERY_SHELF_META, isDiscoveryShelvesEnabled } from "@/lib/discovery";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import { slimSeriesCatalogQueryOptions } from "@/lib/slim-series-catalog-query";
import { slimVodCatalogQueryOptions } from "@/lib/slim-vod-catalog-query";
import { seriesItemsQueryOptions } from "@/lib/series-catalog-items";
import { seriesDiscoveryShelvesQueryOptions } from "@/lib/series-discovery-shelves-query";
import {
  TV_SIMPLE_CATEGORY_BATCH,
  TV_SIMPLE_VOD_BATCH,
} from "@/lib/tv-simple-browse";
import { vodItemsQueryOptions } from "@/lib/vod-catalog-items";
import { vodDiscoveryShelvesQueryOptions } from "@/lib/vod-discovery-shelves-query";
import {
  catalogGridTotal,
  catalogItemsNextPageParam,
  fetchSeriesCatalogGridPage,
  fetchVodCatalogGridPage,
  flattenCatalogPages,
  flattenVodItemsPages,
  seriesCatalogGridInfiniteKey,
  vodCatalogGridInfiniteKey,
} from "@/lib/vod-catalog-infinite";
import type { SeriesItem, VodStream, XtreamCredentials } from "@/lib/xtream-types";
import { looksAdult, parsePositiveRouteId } from "@/lib/utils";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type VodKind = "movie" | "series";

type TvSimpleVodBrowseProps = {
  kind: VodKind;
  creds: XtreamCredentials;
  accountKey: string;
};

/**
 * TV movies/series browse — discovery rows on the landing view, then category drill-down.
 */
export function TvSimpleVodBrowse({
  kind,
  creds,
  accountKey,
}: TvSimpleVodBrowseProps) {
  const searchParams = useSearchParams();
  const {
    isFavorite,
    toggleFavorite,
    hideAdult,
    parentalUnlocked,
    setBrowsePref,
    recents,
    favorites,
  } = usePrefs();
  const { playMovie, movieDetailHref, enrichMovieShelfItems } = useCatalogPlay();
  const catalogReady = useCatalogPageReady();

  const prefKey = kind === "movie" ? "moviesCategory" : "seriesCategory";
  const savedCategory = usePrefs(
    (s) => s.browseByAccount[accountKey]?.[prefKey]
  );

  const [categoryId, setCategoryId] = useState<string | null>(() => {
    if (savedCategory && savedCategory !== "all") {
      return String(savedCategory);
    }
    return null;
  });
  const [visibleCategoryCount, setVisibleCategoryCount] = useState(
    TV_SIMPLE_CATEGORY_BATCH
  );
  const [visibleItemCount, setVisibleItemCount] = useState(TV_SIMPLE_VOD_BATCH);

  const slimQuery = useQuery(
    kind === "movie"
      ? slimVodCatalogQueryOptions(creds, catalogReady)
      : slimSeriesCatalogQueryOptions(creds, catalogReady)
  );

  const filteredCats = useMemo(() => {
    const list = slimQuery.data?.categories ?? [];
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter((c) => !looksAdult({ category_name: c.category_name }));
  }, [slimQuery.data?.categories, hideAdult, parentalUnlocked]);

  const countById = slimQuery.data?.countByCategoryId ?? {};

  const categoryItems = useMemo(
    () =>
      filteredCats.slice(0, visibleCategoryCount).map((c) => ({
        id: String(c.category_id),
        label: c.category_name,
        count: countById[String(c.category_id)],
      })),
    [filteredCats, countById, visibleCategoryCount]
  );

  const selectedName = useMemo(() => {
    if (!categoryId) return "";
    return (
      filteredCats.find((c) => String(c.category_id) === categoryId)
        ?.category_name ?? (kind === "movie" ? "Movies" : "Series")
    );
  }, [categoryId, filteredCats, kind]);

  const pickCategory = useCallback(
    (id: string) => {
      setCategoryId(id);
      setVisibleItemCount(TV_SIMPLE_VOD_BATCH);
      setBrowsePref(accountKey, {
        [prefKey]: id,
      } as { moviesCategory?: string; seriesCategory?: string });
    },
    [accountKey, prefKey, setBrowsePref]
  );

  useEffect(() => {
    const fromUrl = searchParams.get("category");
    if (!fromUrl || fromUrl === "all") return;
    if (!filteredCats.some((c) => String(c.category_id) === fromUrl)) return;
    if (categoryId === fromUrl) return;
    pickCategory(fromUrl);
  }, [searchParams, filteredCats, categoryId, pickCategory]);

  const catalogMetaReady = catalogReady && slimQuery.isSuccess;
  const gridParams = useMemo(
    () => ({
      categoryId: categoryId ?? "all",
      sort: "added" as const,
    }),
    [categoryId]
  );

  const moviePage = useInfiniteQuery({
    queryKey: vodCatalogGridInfiniteKey(creds, gridParams),
    queryFn: ({ pageParam, signal }) =>
      fetchVodCatalogGridPage(creds, gridParams, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: catalogItemsNextPageParam,
    enabled: kind === "movie" && catalogMetaReady && categoryId != null,
    staleTime: 60_000,
    structuralSharing: false,
  });

  const seriesPage = useInfiniteQuery({
    queryKey: seriesCatalogGridInfiniteKey(creds, gridParams),
    queryFn: ({ pageParam, signal }) =>
      fetchSeriesCatalogGridPage(creds, gridParams, pageParam, signal),
    initialPageParam: 0,
    getNextPageParam: catalogItemsNextPageParam,
    enabled: kind === "series" && catalogMetaReady && categoryId != null,
    staleTime: 60_000,
    structuralSharing: false,
  });

  const itemsPage = kind === "movie" ? moviePage : seriesPage;

  const visible = useMemo(() => {
    const allowed = new Set(filteredCats.map((c) => String(c.category_id)));
    if (kind === "movie") {
      const list = flattenVodItemsPages(moviePage.data);
      if (!hideAdult || parentalUnlocked) return list;
      return list.filter(
        (s) =>
          allowed.has(String(s.category_id)) &&
          !looksAdult({ name: s.name, is_adult: s.is_adult })
      );
    }
    const list = flattenCatalogPages(seriesPage.data).filter(
      (s): s is SeriesItem =>
        typeof s === "object" &&
        s != null &&
        parsePositiveRouteId((s as SeriesItem).series_id) != null
    );
    if (!hideAdult || parentalUnlocked) return list;
    return list.filter(
      (s) =>
        allowed.has(String(s.category_id)) && !looksAdult({ name: s.name })
    );
  }, [moviePage.data, seriesPage.data, kind, hideAdult, parentalUnlocked, filteredCats]);

  const displayedItems = useMemo(
    () => visible.slice(0, visibleItemCount),
    [visible, visibleItemCount]
  );

  const totalInView = catalogGridTotal(itemsPage.data) || visible.length;
  const loadMore = useCallback(() => {
    if (!itemsPage.hasNextPage || itemsPage.isFetchingNextPage) return;
    void itemsPage.fetchNextPage();
  }, [itemsPage]);

  // ── Discovery shelves (landing view only) ───────────────────────────────

  const discoveryOn = isDiscoveryShelvesEnabled();
  const [discoveryReady, setDiscoveryReady] = useState(false);

  useEffect(() => {
    if (categoryId != null || slimQuery.isLoading || !discoveryOn) {
      queueMicrotask(() => setDiscoveryReady(false));
      return;
    }
    return scheduleWhenIdle(() => setDiscoveryReady(true), 1_500);
  }, [categoryId, slimQuery.isLoading, discoveryOn]);

  const recentIds = useMemo(
    () =>
      recents
        .filter((r) => r.kind === kind)
        .slice(0, 20)
        .map((r) => r.id),
    [recents, kind]
  );

  const favoriteIds = useMemo(
    () => favorites.filter((f) => f.kind === kind).map((f) => f.id),
    [favorites, kind]
  );

  const recentMoviePage = useQuery(
    vodItemsQueryOptions(
      creds,
      { categoryId: "all", streamIds: recentIds, limit: 20 },
      kind === "movie" && catalogMetaReady && recentIds.length > 0
    )
  );

  const recentSeriesPage = useQuery(
    seriesItemsQueryOptions(
      creds,
      { categoryId: "all", streamIds: recentIds, limit: 20 },
      kind === "series" && catalogMetaReady && recentIds.length > 0
    )
  );

  const discoveryShelves = useQuery(
    kind === "movie"
      ? vodDiscoveryShelvesQueryOptions(
          creds,
          {
            hideAdult,
            parentalUnlocked,
            recentIds,
            favoriteIds,
          },
          discoveryReady
        )
      : seriesDiscoveryShelvesQueryOptions(
          creds,
          {
            hideAdult,
            parentalUnlocked,
            recentIds,
            favoriteIds,
          },
          discoveryReady
        )
  );

  const toggleFavoriteMovie = useCallback(
    (m: VodStream, mid: number) => {
      toggleFavorite({ kind: "movie", id: mid, name: m.name, icon: m.stream_icon });
    },
    [toggleFavorite]
  );

  const toggleFavoriteSeriesItem = useCallback(
    (s: SeriesItem, sid: number) => {
      toggleFavorite({ kind: "series", id: sid, name: s.name, icon: s.cover });
    },
    [toggleFavorite]
  );

  const attachShelves = useCallback(
    (items: Parameters<typeof attachMovieDiscoveryShelfItems>[0]) =>
      kind === "movie"
        ? attachMovieDiscoveryShelfItems(items, {
            isFavorite: (id) => isFavorite("movie", id),
            toggleFavoriteMovie,
            playMovie,
          })
        : attachSeriesDiscoveryShelfItems(items, {
            isFavorite: (id) => isFavorite("series", id),
            toggleFavoriteSeries: toggleFavoriteSeriesItem,
          }),
    [kind, isFavorite, toggleFavoriteMovie, toggleFavoriteSeriesItem, playMovie]
  );

  const recentItems = useMemo(() => {
    if (kind === "movie") {
      const movieById = new Map(
        (recentMoviePage.data?.items ?? []).map((m) => [m.stream_id, m])
      );
      return recents
        .filter((r) => r.kind === "movie")
        .slice(0, 20)
        .map((r) => {
          const mid = parsePositiveRouteId(r.id);
          if (mid == null) return null;
          const movie = movieById.get(mid);
          return {
            id: mid,
            href: `/app/movies/${mid}`,
            poster: movie?.stream_icon ?? r.icon,
            title: r.name,
            subtitle: movie?.year,
            rating: movie?.rating,
            isFavorite: isFavorite("movie", mid),
            onToggleFavorite: () =>
              toggleFavorite({ kind: "movie", id: mid, name: r.name, icon: r.icon }),
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    }

    const seriesById = new Map(
      (recentSeriesPage.data?.items ?? []).map((s) => [
        parsePositiveRouteId(s.series_id),
        s,
      ])
    );
    return recents
      .filter((r) => r.kind === "series")
      .slice(0, 20)
      .map((r) => {
        const sid = parsePositiveRouteId(r.id);
        if (sid == null) return null;
        const s = seriesById.get(sid);
        return {
          id: sid,
          href: `/app/series/${sid}`,
          poster: s?.cover ?? r.icon,
          title: r.name,
          subtitle: s?.year,
          rating: s?.rating,
          isFavorite: isFavorite("series", sid),
          onToggleFavorite: () =>
            toggleFavorite({ kind: "series", id: sid, name: r.name, icon: r.icon }),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [
    kind,
    recents,
    recentMoviePage.data?.items,
    recentSeriesPage.data?.items,
    isFavorite,
    toggleFavorite,
  ]);

  const playableRecentItems = useMemo(
    () =>
      kind === "movie"
        ? enrichMovieShelfItems(recentItems, recentMoviePage.data?.items ?? [])
        : recentItems,
    [kind, recentItems, recentMoviePage.data?.items, enrichMovieShelfItems]
  );

  const forYouItems = useMemo(
    () => attachShelves(discoveryShelves.data?.forYou ?? []),
    [discoveryShelves.data?.forYou, attachShelves]
  );
  const trendingItems = useMemo(
    () => attachShelves(discoveryShelves.data?.trending ?? []),
    [discoveryShelves.data?.trending, attachShelves]
  );
  const topRatedItems = useMemo(
    () => attachShelves(discoveryShelves.data?.topRated ?? []),
    [discoveryShelves.data?.topRated, attachShelves]
  );
  const newlyAddedItems = useMemo(
    () => attachShelves(discoveryShelves.data?.newlyAdded ?? []),
    [discoveryShelves.data?.newlyAdded, attachShelves]
  );
  const genreShelves = useMemo(() => {
    const shelves = discoveryShelves.data?.genreShelves ?? [];
    return shelves.map((shelf) => ({
      ...shelf,
      items: attachShelves(shelf.items),
    }));
  }, [discoveryShelves.data?.genreShelves, attachShelves]);

  const showDiscovery =
    discoveryReady && discoveryOn && categoryId == null && !slimQuery.isLoading;

  const shelfMeta =
    kind === "movie"
      ? {
          forYou: DISCOVERY_SHELF_META.vod_for_you_movies,
          trending: DISCOVERY_SHELF_META.vod_trending_movies,
          topRated: DISCOVERY_SHELF_META.vod_top_rated_movies,
          newlyAdded: DISCOVERY_SHELF_META.vod_new_movies,
        }
      : {
          forYou: DISCOVERY_SHELF_META.vod_for_you_series,
          trending: DISCOVERY_SHELF_META.vod_trending_series,
          topRated: DISCOVERY_SHELF_META.vod_top_rated_series,
          newlyAdded: DISCOVERY_SHELF_META.vod_new_series,
        };

  const browseBase = kind === "movie" ? "/app/movies" : "/app/series";

  if (slimQuery.isLoading && !slimQuery.isFetched) {
    return (
      <div className="tv-simple-browse__loading">
        <Loader2 className="size-8 animate-spin text-(--brand)" aria-hidden />
        <p>Loading {kind === "movie" ? "movies" : "series"}…</p>
      </div>
    );
  }

  if (categoryId == null) {
    return (
      <TvFocusRoot className="tv-simple-browse">
        {showDiscovery && (
          <div className="tv-simple-browse__discovery">
            {playableRecentItems.length > 0 && (
              <MediaShelf
                eyebrow="Pick up where you left off"
                title="Continue Watching"
                items={playableRecentItems}
              />
            )}
            {discoveryOn && forYouItems.length > 0 && (
              <DiscoveryShelf meta={shelfMeta.forYou} items={forYouItems} />
            )}
            {discoveryOn && trendingItems.length > 0 && (
              <DiscoveryShelf
                meta={shelfMeta.trending}
                items={trendingItems}
                loading={discoveryShelves.isLoading && trendingItems.length === 0}
              />
            )}
            {topRatedItems.length > 0 && (
              <DiscoveryShelf meta={shelfMeta.topRated} items={topRatedItems} />
            )}
            {newlyAddedItems.length > 0 && (
              <DiscoveryShelf
                meta={shelfMeta.newlyAdded}
                items={newlyAddedItems}
              />
            )}
            {genreShelves.map((shelf) => (
              <MediaShelf
                key={shelf.categoryId}
                title={shelf.title}
                items={shelf.items}
                seeAllHref={`${browseBase}?category=${encodeURIComponent(shelf.categoryId)}`}
              />
            ))}
          </div>
        )}

        <section className="tv-simple-browse__categories">
          <h2 className="tv-simple-browse__section-title">Browse by category</h2>
          <TvCategoryGrid items={categoryItems} onSelect={pickCategory} />
          {filteredCats.length > visibleCategoryCount ? (
            <button
              type="button"
              data-tv-card-root
              className="tv-simple-browse__more focus-ring"
              onClick={() =>
                setVisibleCategoryCount((n) => n + TV_SIMPLE_CATEGORY_BATCH)
              }
            >
              Show more categories ({visibleCategoryCount} of {filteredCats.length})
            </button>
          ) : null}
        </section>
      </TvFocusRoot>
    );
  }

  return (
    <TvFocusRoot className="tv-simple-browse" autoFocus>
      <button
        type="button"
        data-tv-card-root
        className="tv-simple-browse__back focus-ring"
        onClick={() => {
          setCategoryId(null);
          setVisibleItemCount(TV_SIMPLE_VOD_BATCH);
        }}
      >
        <ArrowLeft className="size-5 shrink-0" aria-hidden />
        <span>{selectedName}</span>
      </button>

      {itemsPage.isLoading ? (
        <div className="tv-simple-browse__loading">
          <Loader2 className="size-8 animate-spin text-(--brand)" aria-hidden />
          <p>Loading titles…</p>
        </div>
      ) : displayedItems.length === 0 ? (
        <p className="tv-simple-browse__empty">Nothing in this category.</p>
      ) : (
        <>
          <p className="tv-simple-browse__count">
            Showing {displayedItems.length}
            {totalInView > displayedItems.length
              ? ` of ${totalInView}`
              : ""}{" "}
            titles
          </p>
          <TvSpatialGrid className="tv-simple-browse__vod-grid tv-simple-browse__vod-grid--simple">
            {kind === "movie"
              ? (displayedItems as VodStream[]).map((m) => (
                  <div key={m.stream_id} className="tv-simple-browse__vod-card">
                    <MediaCard
                      onClick={() => playMovie(m)}
                      detailHref={movieDetailHref(m)}
                      poster={m.stream_icon}
                      title={m.name}
                      subtitle={m.year}
                      rating={m.rating}
                      isFavorite={isFavorite("movie", m.stream_id)}
                      onToggleFavorite={() =>
                        toggleFavorite({
                          kind: "movie",
                          id: m.stream_id,
                          name: m.name,
                          icon: m.stream_icon,
                        })
                      }
                    />
                  </div>
                ))
              : (displayedItems as SeriesItem[]).map((s) => {
                  const sid = parsePositiveRouteId(s.series_id)!;
                  return (
                    <div key={sid} className="tv-simple-browse__vod-card">
                      <MediaCard
                        href={`/app/series/${sid}`}
                        poster={s.cover}
                        title={s.name}
                        subtitle={s.year}
                        rating={s.rating}
                        isFavorite={isFavorite("series", sid)}
                        onToggleFavorite={() =>
                          toggleFavorite({
                            kind: "series",
                            id: sid,
                            name: s.name,
                            icon: s.cover,
                          })
                        }
                      />
                    </div>
                  );
                })}
          </TvSpatialGrid>
          {visibleItemCount < visible.length || itemsPage.hasNextPage ? (
            <button
              type="button"
              data-tv-card-root
              className="tv-simple-browse__more focus-ring"
              disabled={itemsPage.isFetchingNextPage}
              onClick={() => {
                if (visibleItemCount < visible.length) {
                  setVisibleItemCount((n) => n + TV_SIMPLE_VOD_BATCH);
                  return;
                }
                loadMore();
              }}
            >
              {itemsPage.isFetchingNextPage
                ? "Loading…"
                : visibleItemCount < visible.length
                  ? `Show more titles (${displayedItems.length} of ${visible.length})`
                  : `Load more (${displayedItems.length} of ${totalInView})`}
            </button>
          ) : null}
        </>
      )}
    </TvFocusRoot>
  );
}
