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
import {
  attachMovieDiscoveryShelfItems,
  attachSeriesDiscoveryShelfItems,
} from "@/lib/attach-discovery-shelf-items";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import { isDiscoveryShelvesEnabled } from "@/lib/discovery/feature-flag";
import { DISCOVERY_SHELF_META } from "@/lib/discovery/shelf-meta";
import { seriesDiscoveryShelvesQueryOptions } from "@/lib/series-discovery-shelves-query";
import { slimSeriesCatalogQueryOptions } from "@/lib/slim-series-catalog-query";
import { slimVodCatalogQueryOptions } from "@/lib/slim-vod-catalog-query";
import { vodDiscoveryShelvesQueryOptions } from "@/lib/vod-discovery-shelves-query";
import { useCatalogPlay } from "@/hooks/use-catalog-play";
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

function sumCategoryCounts(map: Record<string, number> | undefined): number {
  if (!map) return 0;
  let total = 0;
  for (const n of Object.values(map)) total += n;
  return total;
}

export function HomePageRich() {
  const creds = useAuth((s) => s.creds)!;
  const account = useAuth((s) => s.account);
  const { data: streamSession } = useSession();
  const { play } = usePlayer();
  const { playMovie } = useCatalogPlay();
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
  const [discoveryReady, setDiscoveryReady] = useState(false);
  const discoveryOn = isDiscoveryShelvesEnabled();

  useEffect(() => {
    const enable = () => setCatalogFetchReady(true);
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(enable, { timeout: 3_000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(enable, 800);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!catalogFetchReady || !discoveryOn) {
      queueMicrotask(() => setDiscoveryReady(false));
      return;
    }
    return scheduleWhenIdle(() => setDiscoveryReady(true), 500);
  }, [catalogFetchReady, discoveryOn]);

  const slimVod = useQuery(
    slimVodCatalogQueryOptions(creds, catalogFetchReady)
  );
  const slimSeries = useQuery(
    slimSeriesCatalogQueryOptions(creds, catalogFetchReady)
  );

  const recentMovieIds = useMemo(
    () =>
      recents
        .filter((r) => r.kind === "movie")
        .slice(0, 20)
        .map((r) => r.id),
    [recents]
  );
  const favoriteMovieIds = useMemo(
    () => favorites.filter((f) => f.kind === "movie").map((f) => f.id),
    [favorites]
  );
  const recentSeriesIds = useMemo(
    () =>
      recents
        .filter((r) => r.kind === "series")
        .slice(0, 20)
        .map((r) => r.id),
    [recents]
  );
  const favoriteSeriesIds = useMemo(
    () => favorites.filter((f) => f.kind === "series").map((f) => f.id),
    [favorites]
  );

  const vodDiscovery = useQuery(
    vodDiscoveryShelvesQueryOptions(
      creds,
      {
        hideAdult,
        parentalUnlocked,
        recentIds: recentMovieIds,
        favoriteIds: favoriteMovieIds,
      },
      discoveryReady
    )
  );
  const seriesDiscovery = useQuery(
    seriesDiscoveryShelvesQueryOptions(
      creds,
      {
        hideAdult,
        parentalUnlocked,
        recentIds: recentSeriesIds,
        favoriteIds: favoriteSeriesIds,
      },
      discoveryReady
    )
  );

  const vodCount = sumCategoryCounts(slimVod.data?.countByCategoryId);
  const seriesCount = sumCategoryCounts(slimSeries.data?.countByCategoryId);
  const shelvesLoading =
    discoveryReady &&
    (vodDiscovery.isLoading || seriesDiscovery.isLoading);

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

  const attachMovieShelves = useCallback(
    (items: Parameters<typeof attachMovieDiscoveryShelfItems>[0]) =>
      attachMovieDiscoveryShelfItems(items, {
        isFavorite: (id) => isFavorite("movie", id),
        toggleFavoriteMovie,
        playMovie,
      }),
    [isFavorite, toggleFavoriteMovie, playMovie]
  );

  const attachSeriesShelves = useCallback(
    (items: Parameters<typeof attachSeriesDiscoveryShelfItems>[0]) =>
      attachSeriesDiscoveryShelfItems(items, {
        isFavorite: (id) => isFavorite("series", id),
        toggleFavoriteSeries,
      }),
    [isFavorite, toggleFavoriteSeries]
  );

  const topRatedMovies = useMemo(
    () => attachMovieShelves(vodDiscovery.data?.topRated ?? []),
    [vodDiscovery.data?.topRated, attachMovieShelves]
  );
  const newUpdatedSeries = useMemo(
    () => attachSeriesShelves(seriesDiscovery.data?.newlyAdded ?? []),
    [seriesDiscovery.data?.newlyAdded, attachSeriesShelves]
  );

  const tvHub = useTvHomeHubModel({
    greetingName,
    creds,
    vodCount,
    seriesCount,
    vodLoading: slimVod.isLoading,
    seriesLoading: slimSeries.isLoading,
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
        {(shelvesLoading || topRatedMovies.length > 0) && (
          <TvHomeRow
            title={DISCOVERY_SHELF_META.vod_top_rated_movies.title}
            seeAllHref="/app/movies"
          >
            <TvShelf
              title={DISCOVERY_SHELF_META.vod_top_rated_movies.title}
              hideTitle
              seeAllHref="/app/movies"
            >
              {shelvesLoading && topRatedMovies.length === 0
                ? null
                : topRatedMovies.slice(0, 8).map((m) => (
                    <div key={m.id} className="tv-home-shelf-card">
                      <MediaCard
                        title={m.title}
                        poster={m.poster}
                        panelServer={creds.server}
                        rating={m.rating}
                        href={m.href}
                        detailHref={m.detailHref}
                        onClick={m.onClick}
                        isFavorite={m.isFavorite}
                        onToggleFavorite={m.onToggleFavorite}
                      />
                    </div>
                  ))}
            </TvShelf>
          </TvHomeRow>
        )}
        {(shelvesLoading || newUpdatedSeries.length > 0) && (
          <TvHomeRow
            title={DISCOVERY_SHELF_META.vod_new_series.title}
            seeAllHref="/app/series"
          >
            <TvShelf
              title={DISCOVERY_SHELF_META.vod_new_series.title}
              hideTitle
              seeAllHref="/app/series"
            >
              {shelvesLoading && newUpdatedSeries.length === 0
                ? null
                : newUpdatedSeries.slice(0, 8).map((s) => (
                    <div key={s.id} className="tv-home-shelf-card">
                      <MediaCard
                        title={s.title}
                        poster={s.poster}
                        panelServer={creds.server}
                        href={s.href}
                        isFavorite={s.isFavorite}
                        onToggleFavorite={s.onToggleFavorite}
                      />
                    </div>
                  ))}
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
        movies={undefined}
        series={undefined}
        vodLoading={shelvesLoading}
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
        {shelvesLoading || topRatedMovies.length === 0 ? (
          <SkeletonGrid count={12} />
        ) : (
          <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {sliceShelfItems(topRatedMovies, 12).map((m) => (
              <MediaCard
                key={m.id}
                href={m.href}
                detailHref={m.detailHref}
                onClick={m.onClick}
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
        {shelvesLoading || newUpdatedSeries.length === 0 ? (
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
