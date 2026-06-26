"use client";

import { MediaCard } from "@/components/MediaCard";
import { TvCategoryGrid } from "@/components/tv/TvCategoryGrid";
import { TvFocusRoot } from "@/components/tv/TvFocusRoot";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { useCatalogPlay } from "@/hooks/use-catalog-play";
import { useCatalogPageReady } from "@/hooks/use-catalog-page-ready";
import { slimSeriesCatalogQueryOptions } from "@/lib/slim-series-catalog-query";
import { slimVodCatalogQueryOptions } from "@/lib/slim-vod-catalog-query";
import {
  TV_SIMPLE_CATEGORY_BATCH,
  TV_SIMPLE_VOD_BATCH,
} from "@/lib/tv-simple-browse";
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
import { useCallback, useMemo, useState } from "react";

type VodKind = "movie" | "series";

type TvSimpleVodBrowseProps = {
  kind: VodKind;
  creds: XtreamCredentials;
  accountKey: string;
};

/**
 * Category-first movies/series browse for TV — no discovery shelves or search UI.
 */
export function TvSimpleVodBrowse({
  kind,
  creds,
  accountKey,
}: TvSimpleVodBrowseProps) {
  const {
    isFavorite,
    toggleFavorite,
    hideAdult,
    parentalUnlocked,
    setBrowsePref,
  } = usePrefs();
  const { playMovie, movieDetailHref } = useCatalogPlay();
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

  const displayedItems = useMemo(
    () => visible.slice(0, visibleItemCount),
    [visible, visibleItemCount]
  );

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

  const totalInView = catalogGridTotal(itemsPage.data) || visible.length;
  const loadMore = useCallback(() => {
    if (!itemsPage.hasNextPage || itemsPage.isFetchingNextPage) return;
    void itemsPage.fetchNextPage();
  }, [itemsPage]);

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
        <p className="tv-simple-browse__lead">
          Choose a {kind === "movie" ? "movie" : "series"} category
        </p>
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
