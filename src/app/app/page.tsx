"use client";

import { MediaCard } from "@/components/MediaCard";
import { LiveMediaCard } from "@/components/LiveMediaCard";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import { LiveChannelTile } from "@/components/LiveChannelTile";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { TvHomeHub } from "@/components/TvHomeHub";
import { looksAdult, parsePositiveRouteId } from "@/lib/utils";
import { useLivingRoomHomeLayout } from "@/lib/use-living-room-home-layout";
import { buildLivePlayUrl, xtream } from "@/lib/xtream";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import {
  Clapperboard,
  PlaySquare,
  Radio,
  Sparkles,
  Tv,
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  const creds = useAuth((s) => s.creds)!;
  const account = useAuth((s) => s.account);
  const { play } = usePlayer();
  const livingRoomHome = useLivingRoomHomeLayout();
  const {
    recents,
    favorites,
    isFavorite,
    toggleFavorite,
    addRecent,
    hideAdult,
    parentalUnlocked,
  } = usePrefs();

  const live = useQuery({
    queryKey: ["live", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.liveStreamsAll(creds, { signal }),
  });
  const vod = useQuery({
    queryKey: ["vod", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.vodStreams(creds, undefined, signal),
  });
  const series = useQuery({
    queryKey: ["series", creds.server, creds.username, "all"],
    queryFn: ({ signal }) => xtream.series(creds, undefined, signal),
  });

  const safe = hideAdult && !parentalUnlocked;
  const trendingMovies = (vod.data || [])
    .filter((m) => parsePositiveRouteId(m.stream_id) != null)
    .filter((m) => !safe || !looksAdult({ name: m.name, is_adult: m.is_adult }))
    .slice()
    .sort((a, b) => {
      const ar = parseFloat(a.rating || "0") || 0;
      const br = parseFloat(b.rating || "0") || 0;
      return br - ar;
    })
    .slice(0, 18);

  const newSeries = (series.data || [])
    .filter((s) => parsePositiveRouteId(s.series_id) != null)
    .filter((s) => !safe || !looksAdult({ name: s.name }))
    .slice()
    .sort((a, b) => {
      const ad = parseInt(a.last_modified || "0", 10) || 0;
      const bd = parseInt(b.last_modified || "0", 10) || 0;
      return bd - ad;
    })
    .slice(0, 18);

  const popularLive = (live.data || [])
    .filter((c) => !safe || !looksAdult({ name: c.name, is_adult: c.is_adult }))
    .slice(0, 12);

  if (livingRoomHome) {
    return (
      <TvHomeHub
        username={account?.user_info.username || creds.username}
        creds={creds}
        liveLoading={live.isLoading}
        vodLoading={vod.isLoading}
        seriesLoading={series.isLoading}
        liveCount={live.data?.length}
        vodCount={vod.data?.length}
        seriesCount={series.data?.length}
        favoritesCount={favorites.length}
        trendingMovies={trendingMovies}
        newSeries={newSeries}
        popularLive={popularLive}
        recents={recents}
        parseMovieId={(m) => parsePositiveRouteId(m.stream_id)}
        parseSeriesId={(s) => parsePositiveRouteId(s.series_id)}
        play={play}
        addRecent={addRecent}
        isFavorite={isFavorite}
        toggleFavorite={toggleFavorite}
      />
    );
  }

  return (
    <div className="space-y-10">
      <Hero username={account?.user_info.username || creds.username} />

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat
          icon={<Tv className="size-4" />}
          label="Live channels"
          value={live.data?.length}
          loading={live.isLoading}
          href="/app/live"
          accent="text-(--brand-2)"
        />
        <Stat
          icon={<Clapperboard className="size-4" />}
          label="Movies"
          value={vod.data?.length}
          loading={vod.isLoading}
          href="/app/movies"
          accent="text-(--brand)"
        />
        <Stat
          icon={<PlaySquare className="size-4" />}
          label="Series"
          value={series.data?.length}
          loading={series.isLoading}
          href="/app/series"
          accent="text-amber-300"
        />
        <Stat
          icon={<Sparkles className="size-4" />}
          label="Favorites"
          value={favorites.length}
          loading={false}
          href="/app/favorites"
          accent="text-(--danger)"
        />
      </div>

      {/* Recent */}
      {recents.length > 0 && (
        <section>
          <SectionHeader
            eyebrow="Pick up where you left off"
            title="Continue watching"
          />
          <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {recents.slice(0, 12).map((r) =>
              r.kind === "live" ? (
                <LiveMediaCard
                  key={`live-${r.id}`}
                  streamId={r.id}
                  creds={creds}
                  title={r.name}
                  poster={r.icon}
                  posterFit="contain"
                  badge="Live"
                  onClick={() => {
                    play({
                      kind: "live",
                      id: r.id,
                      title: r.name,
                      poster: r.icon,
                      url: buildLivePlayUrl(creds, {
                        stream_id: r.id,
                        direct_source:
                          typeof r.meta?.direct_source === "string"
                            ? r.meta.direct_source
                            : undefined,
                      }),
                    });
                    addRecent(r);
                  }}
                  isFavorite={isFavorite("live", r.id)}
                  onToggleFavorite={() =>
                    toggleFavorite({ kind: "live", id: r.id, name: r.name, icon: r.icon })
                  }
                />
              ) : (
                <MediaCard
                  key={`${r.kind}-${r.id}`}
                  title={r.name}
                  poster={r.icon}
                  badge={r.kind === "movie" ? "Movie" : "Series"}
                  href={
                    r.kind === "movie"
                      ? `/app/movies/${r.id}`
                      : `/app/series/${r.id}`
                  }
                  isFavorite={isFavorite(r.kind, r.id)}
                  onToggleFavorite={() =>
                    toggleFavorite({ kind: r.kind, id: r.id, name: r.name, icon: r.icon })
                  }
                />
              )
            )}
          </TvSpatialGrid>
        </section>
      )}

      {/* Trending Movies */}
      <section>
        <SectionHeader
          eyebrow="Top rated"
          title="Trending Movies"
          right={
            <Link href="/app/movies" className="text-sm text-(--text-dim) hover:text-(--text)">
              See all →
            </Link>
          }
        />
        {vod.isLoading ? (
          <SkeletonGrid count={12} />
        ) : (
          <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {trendingMovies.map((m) => {
              const mid = parsePositiveRouteId(m.stream_id)!;
              return (
                <MediaCard
                  key={mid}
                  href={`/app/movies/${mid}`}
                  poster={m.stream_icon}
                  title={m.name}
                  subtitle={m.year}
                  rating={m.rating}
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
              );
            })}
          </TvSpatialGrid>
        )}
      </section>

      {/* New Series */}
      <section>
        <SectionHeader
          eyebrow="Just added"
          title="Fresh Series"
          right={
            <Link href="/app/series" className="text-sm text-(--text-dim) hover:text-(--text)">
              See all →
            </Link>
          }
        />
        {series.isLoading ? (
          <SkeletonGrid count={12} />
        ) : (
          <TvSpatialGrid className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {newSeries.map((s) => {
              const sid = parsePositiveRouteId(s.series_id)!;
              return (
                <MediaCard
                  key={sid}
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
              );
            })}
          </TvSpatialGrid>
        )}
      </section>

      {/* Popular Live */}
      <section>
        <SectionHeader
          eyebrow="Live right now"
          title="Live TV"
          right={
            <Link href="/app/live" className="text-sm text-(--text-dim) hover:text-(--text)">
              See all →
            </Link>
          }
        />
        {live.isLoading ? (
          <SkeletonGrid variant="tile" count={9} />
        ) : (
          <TvSpatialGrid className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {popularLive.map((c) => (
              <LiveChannelTile
                key={c.stream_id}
                streamId={c.stream_id}
                number={c.num}
                name={c.name}
                icon={c.stream_icon}
                isFavorite={isFavorite("live", c.stream_id)}
                onToggleFavorite={() =>
                  toggleFavorite({
                    kind: "live",
                    id: c.stream_id,
                    name: c.name,
                    icon: c.stream_icon,
                    ...(c.direct_source?.trim()
                      ? { meta: { direct_source: c.direct_source.trim() } }
                      : {}),
                  })
                }
                onClick={() => {
                  play({
                    kind: "live",
                    id: c.stream_id,
                    title: c.name,
                    poster: c.stream_icon,
                    url: buildLivePlayUrl(creds, c),
                  });
                  addRecent({
                    kind: "live",
                    id: c.stream_id,
                    name: c.name,
                    icon: c.stream_icon,
                    ...(c.direct_source?.trim()
                      ? { meta: { direct_source: c.direct_source.trim() } }
                      : {}),
                  });
                }}
              />
            ))}
          </TvSpatialGrid>
        )}
      </section>
    </div>
  );
}

function Hero({ username }: { username: string }) {
  return (
    <div className="relative overflow-hidden card p-6 sm:p-10">
      <div className="absolute inset-0 -z-10 opacity-80">
        <div className="absolute -top-20 -right-10 size-72 bg-(--brand)/30 blur-[80px] rounded-full" />
        <div className="absolute -bottom-20 -left-10 size-72 bg-(--brand-2)/15 blur-[80px] rounded-full" />
      </div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-(--brand-2) mb-2 flex items-center gap-2">
        <Radio className="size-3.5" /> Welcome back
      </div>
      <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
        Hey {username}, what are we watching?
      </h2>
      <p className="text-(--text-dim) mt-2 max-w-xl">
        Browse live channels, dive into thousands of movies and series, or jump
        straight back into something you started. Press{" "}
        <kbd className="chip">⌘K</kbd> to search anything.
      </p>
      <div className="flex flex-wrap gap-2 mt-5">
        <Link
          href="/app/live"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl btn-brand text-sm font-medium"
        >
          <Tv className="size-4" /> Watch Live TV
        </Link>
        <Link
          href="/app/movies"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-sm border border-white/10 transition-colors"
        >
          <Clapperboard className="size-4" /> Browse Movies
        </Link>
        <Link
          href="/app/series"
          className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-sm border border-white/10 transition-colors"
        >
          <PlaySquare className="size-4" /> Browse Series
        </Link>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  loading,
  href,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  loading: boolean;
  href: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className="card p-4 hover:border-(--line-2) hover:bg-(--bg-3)/60 transition-colors flex items-center gap-3"
    >
      <div className={`size-9 rounded-lg bg-white/5 grid place-items-center ${accent}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-(--text-muted)">{label}</div>
        {loading ? (
          <div className="skeleton h-4 w-12 mt-1" />
        ) : (
          <div className="text-lg font-semibold tabular-nums">
            {(value || 0).toLocaleString()}
          </div>
        )}
      </div>
    </Link>
  );
}
