"use client";

import { ChannelTile } from "@/components/ChannelTile";
import { MediaCard } from "@/components/MediaCard";
import { SectionHeader, SkeletonGrid } from "@/components/SectionHeader";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import type { LiveStream, SeriesItem, VodStream, XtreamCredentials } from "@/lib/xtream-types";
import { buildLivePlayUrl } from "@/lib/xtream";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  Clapperboard,
  Heart,
  PlaySquare,
  Radio,
  Search,
  Settings,
  Tv,
} from "lucide-react";
import Link from "next/link";
import type { Favorite, RecentItem } from "@/store/preferences";

import type { PlayerPlaylist, PlayerSource } from "@/store/player";

export type TvHomeHubProps = {
  username: string;
  creds: XtreamCredentials;
  liveLoading: boolean;
  vodLoading: boolean;
  seriesLoading: boolean;
  liveCount?: number;
  vodCount?: number;
  seriesCount?: number;
  favoritesCount: number;
  trendingMovies: VodStream[];
  newSeries: SeriesItem[];
  popularLive: LiveStream[];
  recents: RecentItem[];
  parseMovieId: (m: VodStream) => number | null;
  parseSeriesId: (s: SeriesItem) => number | null;
  play: (s: PlayerSource, opts?: { playlist?: PlayerPlaylist }) => void;
  addRecent: (f: Omit<Favorite, "addedAt">) => void;
  isFavorite: (kind: Favorite["kind"], id: number) => boolean;
  toggleFavorite: (f: Omit<Favorite, "addedAt">) => void;
};

export function TvHomeHub({
  username,
  creds,
  liveLoading,
  vodLoading,
  seriesLoading,
  liveCount,
  vodCount,
  seriesCount,
  favoritesCount,
  trendingMovies,
  newSeries,
  popularLive,
  recents,
  parseMovieId,
  parseSeriesId,
  play,
  addRecent,
  isFavorite,
  toggleFavorite,
}: TvHomeHubProps) {
  return (
    <div className="space-y-10 pb-6">
      <section className="relative overflow-hidden rounded-3xl border border-(--line) bg-(--bg-2)/80 px-6 py-8 sm:px-10 sm:py-10">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-24 -right-16 size-[min(100vw,28rem)] rounded-full bg-(--brand)/22 blur-[100px]" />
          <div className="absolute -bottom-28 -left-12 size-[min(90vw,24rem)] rounded-full bg-(--brand-2)/14 blur-[90px]" />
        </div>
        <p className="text-[11px] uppercase tracking-[0.2em] text-(--brand-2) mb-2 flex items-center gap-2">
          <Radio className="size-3.5 shrink-0" aria-hidden />
          TV home
        </p>
        <h1 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-semibold tracking-tight text-(--text) max-w-3xl">
          Hey {username}, where to first?
        </h1>
        <p className="mt-3 text-base sm:text-lg text-(--text-muted) max-w-2xl leading-relaxed">
          Pick a destination below — each tile is remote-friendly. Use{" "}
          <strong className="text-(--text)">Search</strong> in the bar above to
          jump straight to a show or channel by name.
        </p>

        <dl className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
          <StatPill label="Live" value={liveCount} loading={liveLoading} />
          <StatPill label="Movies" value={vodCount} loading={vodLoading} />
          <StatPill label="Series" value={seriesCount} loading={seriesLoading} />
          <StatPill label="Favorites" value={favoritesCount} loading={false} />
        </dl>
      </section>

      <section aria-labelledby="tv-hub-dest-heading">
        <h2 id="tv-hub-dest-heading" className="sr-only">
          Main destinations
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <HubTile
            href="/app/live"
            icon={Tv}
            title="Live TV"
            subtitle="Guide, categories, play"
            accent="from-violet-500/25 to-fuchsia-500/10"
          />
          <HubTile
            href="/app/series"
            icon={PlaySquare}
            title="Series"
            subtitle="Seasons & episodes"
            accent="from-amber-400/20 to-orange-500/10"
          />
          <HubTile
            href="/app/movies"
            icon={Clapperboard}
            title="Movies"
            subtitle="Library & details"
            accent="from-sky-400/20 to-cyan-500/10"
          />
          <HubTile
            href="/app/search"
            icon={Search}
            title="Search"
            subtitle="Find anything fast"
            accent="from-emerald-400/18 to-teal-500/10"
          />
          <HubTile
            href="/app/favorites"
            icon={Heart}
            title="Favorites"
            subtitle="Saved channels & titles"
            accent="from-rose-400/18 to-red-500/10"
          />
          <HubTile
            href="/app/settings"
            icon={Settings}
            title="Settings"
            subtitle="Accounts & TV options"
            accent="from-slate-400/15 to-slate-600/10"
          />
        </div>
      </section>

      {recents.length > 0 && (
        <section>
          <SectionHeader
            eyebrow="Resume"
            title="Continue watching"
          />
          <TvSpatialGrid className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {recents.slice(0, 8).map((r) => (
              <MediaCard
                key={`${r.kind}-${r.id}`}
                title={r.name}
                poster={r.icon}
                badge={
                  r.kind === "live" ? "Live" : r.kind === "movie" ? "Movie" : "Series"
                }
                href={
                  r.kind === "movie"
                    ? `/app/movies/${r.id}`
                    : r.kind === "series"
                      ? `/app/series/${r.id}`
                      : undefined
                }
                onClick={
                  r.kind === "live"
                    ? () => {
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
                      }
                    : undefined
                }
                isFavorite={isFavorite(r.kind, r.id)}
                onToggleFavorite={() =>
                  toggleFavorite({
                    kind: r.kind,
                    id: r.id,
                    name: r.name,
                    icon: r.icon,
                  })
                }
              />
            ))}
          </TvSpatialGrid>
        </section>
      )}

      <section>
        <SectionHeader
          eyebrow="Live right now"
          title="Popular channels"
          right={
            <Link
              href="/app/live"
              className="text-sm min-h-11 inline-flex items-center text-(--text-dim) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50 rounded-lg px-2"
            >
              Open full guide →
            </Link>
          }
        />
        {liveLoading ? (
          <SkeletonGrid variant="tile" count={6} />
        ) : (
          <TvSpatialGrid className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {popularLive.slice(0, 8).map((c) => (
              <ChannelTile
                key={c.stream_id}
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

      <section>
        <SectionHeader
          eyebrow="Top rated"
          title="Trending movies"
          right={
            <Link
              href="/app/movies"
              className="text-sm min-h-11 inline-flex items-center text-(--text-dim) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50 rounded-lg px-2"
            >
              See all →
            </Link>
          }
        />
        {vodLoading ? (
          <SkeletonGrid count={8} />
        ) : (
          <TvSpatialGrid className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {trendingMovies.slice(0, 8).map((m) => {
              const mid = parseMovieId(m);
              if (mid == null) return null;
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

      <section>
        <SectionHeader
          eyebrow="Just added"
          title="Fresh series"
          right={
            <Link
              href="/app/series"
              className="text-sm min-h-11 inline-flex items-center text-(--text-dim) hover:text-(--text) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50 rounded-lg px-2"
            >
              See all →
            </Link>
          }
        />
        {seriesLoading ? (
          <SkeletonGrid count={8} />
        ) : (
          <TvSpatialGrid className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {newSeries.slice(0, 8).map((s) => {
              const sid = parseSeriesId(s);
              if (sid == null) return null;
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
    </div>
  );
}

function StatPill({
  label,
  value,
  loading,
}: {
  label: string;
  value?: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-(--line) bg-(--bg-3)/60 px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wider text-(--text-muted)">
        {label}
      </dt>
      <dd className="mt-1 text-xl font-semibold tabular-nums text-(--text)">
        {loading ? <span className="skeleton inline-block h-6 w-14 rounded-md" /> : (value ?? 0).toLocaleString()}
      </dd>
    </div>
  );
}

function HubTile({
  href,
  icon: Icon,
  title,
  subtitle,
  accent,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "focus-ring group relative flex min-h-[7.5rem] flex-col justify-between overflow-hidden rounded-2xl border border-(--line) bg-(--bg-2)/90 p-5 transition-[transform,box-shadow,border-color] duration-200",
        "hover:border-(--brand)/40 hover:shadow-[0_20px_50px_rgba(0,0,0,0.35)] active:scale-[0.99]",
        "outline-offset-4"
      )}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 bg-gradient-to-br",
          accent
        )}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <div className="text-lg sm:text-xl font-semibold tracking-tight text-(--text)">
            {title}
          </div>
          <div className="mt-1 text-sm text-(--text-muted) leading-snug max-w-[14rem]">
            {subtitle}
          </div>
        </div>
        <div className="size-12 shrink-0 rounded-xl bg-(--bg-3) border border-(--line) grid place-items-center text-(--brand-2) group-hover:border-(--brand)/35 transition-colors">
          <Icon className="size-6" aria-hidden />
        </div>
      </div>
      <div className="relative mt-4 text-xs font-medium text-(--brand-2)">
        Press OK to open →
      </div>
    </Link>
  );
}
