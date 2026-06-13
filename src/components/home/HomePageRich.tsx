"use client";

import { HomeRegionalTrendingSection } from "@/components/home/HomeRegionalTrendingSection";
import { TvHomeHub } from "@/components/TvHomeHub";
import { MediaCard } from "@/components/MediaCard";
import { useTvHomeHubModel } from "@/hooks/use-tv-home-hub-model";
import { welcomeDisplayName } from "@/lib/welcome-display-name";
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
import { seriesCatalogQueryOptions } from "@/lib/series-catalog-query";
import { vodCatalogQueryOptions } from "@/lib/vod-catalog-query";
import { useLivingRoomHomeLayout } from "@/lib/use-living-room-home-layout";
import type { LiveStream, SeriesItem, VodStream } from "@/lib/xtream-types";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { sliceShelfItems } from "@/hooks/use-vod-discovery-shelves";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

export function HomePageRich() {
  const creds = useAuth((s) => s.creds)!;
  const account = useAuth((s) => s.account);
  const { data: streamSession } = useSession();
  const { play } = usePlayer();
  const livingRoomHome = useLivingRoomHomeLayout();
  const {
    isFavorite,
    toggleFavorite,
    hideAdult,
    parentalUnlocked,
    recents,
    favorites,
    addRecent,
  } = usePrefs();

  const greetingName = welcomeDisplayName({
    streamName: streamSession?.user?.name,
    streamEmail: streamSession?.user?.email,
    iptvUsername: account?.user_info.username || creds.username,
  });

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

  const vodCatalog = useQuery({
    ...vodCatalogQueryOptions(creds, catalogFetchReady),
  });
  const seriesCatalog = useQuery({
    ...seriesCatalogQueryOptions(creds, catalogFetchReady),
  });
  const vodStreams = vodCatalog.data?.streams;
  const seriesStreams = seriesCatalog.data?.streams;

  const safeOpts = useMemo(
    () => ({ hideAdult, parentalUnlocked }),
    [hideAdult, parentalUnlocked]
  );

  useEffect(() => {
    let cancelled = false;
    const list = vodStreams;
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
  }, [vodStreams, safeOpts]);

  useEffect(() => {
    let cancelled = false;
    const list = seriesStreams;
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
  }, [seriesStreams, safeOpts]);

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
  const toggleFavoriteLive = useCallback(
    (stream: LiveStream) => {
      toggleFavorite({
        kind: "live",
        id: stream.stream_id,
        name: stream.name,
        icon: stream.stream_icon,
        ...(stream.direct_source?.trim()
          ? { meta: { direct_source: stream.direct_source.trim() } }
          : {}),
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

  const tvHub = useTvHomeHubModel({
    greetingName,
    creds,
    movies: vodStreams,
    series: seriesStreams,
    vodLoading: vodCatalog.isLoading,
    seriesLoading: seriesCatalog.isLoading,
    recents,
    favorites,
    hideAdult,
    parentalUnlocked,
    isFavorite,
    toggleFavorite,
    play,
    addRecent,
  });

  if (livingRoomHome) {
    return (
      <div className="tv-home tv-home--rich space-y-8">
        <TvHomeHub {...tvHub} />
        {(vodCatalog.isLoading || topRatedMovieStreams.length > 0) && (
          <TvHomeRow
            title={DISCOVERY_SHELF_META.vod_top_rated_movies.title}
            seeAllHref="/app/movies"
          >
            <TvShelf
              title={DISCOVERY_SHELF_META.vod_top_rated_movies.title}
              hideTitle
              seeAllHref="/app/movies"
            >
              {vodCatalog.isLoading
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
        {(seriesCatalog.isLoading || newUpdatedSeriesStreams.length > 0) && (
          <TvHomeRow
            title={DISCOVERY_SHELF_META.vod_new_series.title}
            seeAllHref="/app/series"
          >
            <TvShelf
              title={DISCOVERY_SHELF_META.vod_new_series.title}
              hideTitle
              seeAllHref="/app/series"
            >
              {seriesCatalog.isLoading
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
      <HomeRegionalTrendingSection
        creds={creds}
        movies={vodStreams}
        series={seriesStreams}
        vodLoading={vodCatalog.isLoading || seriesCatalog.isLoading}
        recents={recents}
        favorites={favorites}
        hideAdult={hideAdult}
        parentalUnlocked={parentalUnlocked}
        isFavorite={isFavorite}
        toggleFavoriteMovie={toggleFavoriteMovie}
        toggleFavoriteSeries={toggleFavoriteSeries}
        toggleFavoriteLive={toggleFavoriteLive}
      />
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
        {vodCatalog.isLoading || topRatedMovies.length === 0 ? (
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
        {seriesCatalog.isLoading || newUpdatedSeries.length === 0 ? (
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
