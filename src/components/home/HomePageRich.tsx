"use client";

import { MediaCard } from "@/components/MediaCard";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { TvHomeRow } from "@/components/tv/TvHomeRow";
import { TvShelf } from "@/components/TvShelf";
import { parsePositiveRouteId } from "@/lib/utils";
import {
  pickNewestSeries,
  pickTopMoviesByRating,
} from "@/lib/catalog-preview";
import { buildTopRatedMovies, buildNewSeries } from "@/lib/discovery";
import { DISCOVERY_SHELF_META } from "@/lib/discovery/shelf-meta";
import { useLivingRoomHomeLayout } from "@/lib/use-living-room-home-layout";
import { xtream } from "@/lib/xtream";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";
import { useAuth } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import { sliceShelfItems } from "@/hooks/use-vod-discovery-shelves";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

export function HomePageRich() {
  const creds = useAuth((s) => s.creds)!;
  const livingRoomHome = useLivingRoomHomeLayout();
  const {
    isFavorite,
    toggleFavorite,
    hideAdult,
    parentalUnlocked,
  } = usePrefs();

  const [catalogFetchReady, setCatalogFetchReady] = useState(false);
  const [topRatedMovieStreams, setTopRatedMovieStreams] = useState<VodStream[]>(
    []
  );
  const [newUpdatedSeriesStreams, setNewUpdatedSeriesStreams] = useState<
    SeriesItem[]
  >([]);

  useEffect(() => {
    const enable = () => setCatalogFetchReady(true);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(enable, { timeout: 3_000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(enable, 800);
    return () => clearTimeout(t);
  }, []);

  const vod = useQuery({
    queryKey: ["vod", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.vodStreams(creds, undefined, signal),
    enabled: catalogFetchReady,
  });
  const series = useQuery({
    queryKey: ["series", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.series(creds, undefined, signal),
    enabled: catalogFetchReady,
  });

  const safeOpts = useMemo(
    () => ({ hideAdult, parentalUnlocked }),
    [hideAdult, parentalUnlocked]
  );

  useEffect(() => {
    let cancelled = false;
    const list = vod.data;
    const run = async () => {
      if (!list?.length) {
        if (!cancelled) setTopRatedMovieStreams([]);
        return;
      }
      const picked = await pickTopMoviesByRating(list, 18, safeOpts);
      if (!cancelled) setTopRatedMovieStreams(picked);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [vod.data, safeOpts]);

  useEffect(() => {
    let cancelled = false;
    const list = series.data;
    const run = async () => {
      if (!list?.length) {
        if (!cancelled) setNewUpdatedSeriesStreams([]);
        return;
      }
      const picked = await pickNewestSeries(list, 18, safeOpts);
      if (!cancelled) setNewUpdatedSeriesStreams(picked);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [series.data, safeOpts]);

  const toggleFavoriteMovie = useCallback(
    (m: VodStream, mid: number) => {
      toggleFavorite({
        kind: "movie",
        id: mid,
        name: m.name,
        icon: m.stream_icon,
      });
    },
    [toggleFavorite]
  );
  const toggleFavoriteSeries = useCallback(
    (s: SeriesItem, sid: number) => {
      toggleFavorite({
        kind: "series",
        id: sid,
        name: s.name,
        icon: s.cover,
      });
    },
    [toggleFavorite]
  );

  const topRatedMovies = useMemo(
    () =>
      buildTopRatedMovies(topRatedMovieStreams, {
        hideAdult,
        parentalUnlocked,
        isFavorite: (id) => isFavorite("movie", id),
        toggleFavorite: toggleFavoriteMovie,
        limit: 18,
        minRating: 0,
      }),
    [
      topRatedMovieStreams,
      hideAdult,
      parentalUnlocked,
      isFavorite,
      toggleFavoriteMovie,
    ]
  );

  const newUpdatedSeries = useMemo(
    () =>
      buildNewSeries(newUpdatedSeriesStreams, {
        hideAdult,
        parentalUnlocked,
        isFavorite: (id) => isFavorite("series", id),
        toggleFavorite: toggleFavoriteSeries,
        limit: 18,
      }),
    [
      newUpdatedSeriesStreams,
      hideAdult,
      parentalUnlocked,
      isFavorite,
      toggleFavoriteSeries,
    ]
  );

  if (livingRoomHome) {
    return (
      <div className="tv-home tv-home--rich space-y-8 pt-6">
        {(vod.isLoading || topRatedMovieStreams.length > 0) && (
          <TvHomeRow
            title={DISCOVERY_SHELF_META.vod_top_rated_movies.title}
            seeAllHref="/app/movies"
          >
            <TvShelf
              title={DISCOVERY_SHELF_META.vod_top_rated_movies.title}
              hideTitle
              seeAllHref="/app/movies"
            >
              {vod.isLoading
                ? null
                : topRatedMovieStreams.slice(0, 8).map((m) => {
                    const mid = parsePositiveRouteId(m.stream_id);
                    if (mid == null) return null;
                    return (
                      <div key={mid} className="tv-home-shelf-card">
                        <MediaCard
                          title={m.name}
                          poster={m.stream_icon}
                          panelServer={creds.server}
                          rating={m.rating}
                          href={`/app/movies/${mid}`}
                          isFavorite={isFavorite("movie", mid)}
                          onToggleFavorite={() =>
                            toggleFavorite({
                              kind: "movie",
                              id: mid,
                              name: m.name,
                              icon: m.stream_icon,
                            })
                          }
                        />
                      </div>
                    );
                  })}
            </TvShelf>
          </TvHomeRow>
        )}
        {(series.isLoading || newUpdatedSeriesStreams.length > 0) && (
          <TvHomeRow
            title={DISCOVERY_SHELF_META.vod_new_series.title}
            seeAllHref="/app/series"
          >
            <TvShelf
              title={DISCOVERY_SHELF_META.vod_new_series.title}
              hideTitle
              seeAllHref="/app/series"
            >
              {series.isLoading
                ? null
                : newUpdatedSeriesStreams.slice(0, 8).map((s) => {
                    const sid = parsePositiveRouteId(s.series_id);
                    if (sid == null) return null;
                    return (
                      <div key={sid} className="tv-home-shelf-card">
                        <MediaCard
                          title={s.name}
                          poster={s.cover}
                          panelServer={creds.server}
                          href={`/app/series/${sid}`}
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
            </TvShelf>
          </TvHomeRow>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-10 pt-4 border-t border-white/5">
      <section>
        <SectionHeader
          eyebrow={DISCOVERY_SHELF_META.vod_top_rated_movies.eyebrow}
          title={DISCOVERY_SHELF_META.vod_top_rated_movies.title}
          right={
            <Link
              href="/app/movies"
              className="text-sm text-(--text-dim) hover:text-(--text)"
            >
              See all →
            </Link>
          }
        />
        {vod.isLoading || topRatedMovies.length === 0 ? (
          <SkeletonGrid count={12} />
        ) : (
          <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sliceShelfItems(topRatedMovies, 12).map((m) => (
              <MediaCard
                key={m.id}
                href={m.href}
                poster={m.poster}
                title={m.title}
                subtitle={m.subtitle}
                rating={m.rating}
                isFavorite={m.isFavorite}
                onToggleFavorite={m.onToggleFavorite}
              />
            ))}
          </TvSpatialGrid>
        )}
      </section>

      <section>
        <SectionHeader
          eyebrow={DISCOVERY_SHELF_META.vod_new_series.eyebrow}
          title={DISCOVERY_SHELF_META.vod_new_series.title}
          right={
            <Link
              href="/app/series"
              className="text-sm text-(--text-dim) hover:text-(--text)"
            >
              See all →
            </Link>
          }
        />
        {series.isLoading || newUpdatedSeries.length === 0 ? (
          <SkeletonGrid count={12} />
        ) : (
          <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sliceShelfItems(newUpdatedSeries, 12).map((s) => (
              <MediaCard
                key={s.id}
                href={s.href}
                poster={s.poster}
                title={s.title}
                subtitle={s.subtitle}
                rating={s.rating}
                isFavorite={s.isFavorite}
                onToggleFavorite={s.onToggleFavorite}
              />
            ))}
          </TvSpatialGrid>
        )}
      </section>
    </div>
  );
}
