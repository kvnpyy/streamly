"use client";

import {
  cn,
  normalizeContainerExt,
  parsePositiveRouteId,
  vodContainerUiHint,
} from "@/lib/utils";
import { buildImageProxy, buildSeriesEpisodePlayUrl, xtream } from "@/lib/xtream";
import type { SeriesEpisode } from "@/lib/xtream-types";
import { useAuth } from "@/store/auth";
import { usePlayer, type PlayerPlaylist } from "@/store/player";
import { usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Heart, Play, Star } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

function SeriesDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-8 w-32 rounded-lg" />
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 md:col-span-4 lg:col-span-3">
          <div className="skeleton aspect-[2/3] rounded-2xl" />
        </div>
        <div className="col-span-12 md:col-span-8 lg:col-span-9 space-y-3">
          <div className="skeleton h-8 w-2/3" />
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-4 w-full" />
          <div className="skeleton h-4 w-3/4" />
        </div>
      </div>
    </div>
  );
}

export default function SeriesDetail() {
  const params = useParams<{ id: string }>();
  const seriesId = parsePositiveRouteId(params.id);
  const creds = useAuth((s) => s.creds);
  const { play } = usePlayer();
  const { isFavorite, toggleFavorite, addRecent } = usePrefs();
  const [imgErr, setImgErr] = useState(false);

  const info = useQuery({
    queryKey: ["series-info", creds?.server, creds?.username, seriesId],
    queryFn: ({ signal }) => xtream.seriesInfo(creds!, seriesId!, signal),
    enabled: Boolean(creds && seriesId != null),
    retry: 2,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
  });

  const seasons = useMemo(() => {
    if (!info.data) return [] as string[];
    return Object.keys(info.data.episodes || {}).sort(
      (a, b) => parseInt(a, 10) - parseInt(b, 10)
    );
  }, [info.data]);

  const [manualSeason, setManualSeason] = useState<string | null>(null);
  const activeSeason = useMemo(() => {
    if (manualSeason != null && seasons.includes(manualSeason)) {
      return manualSeason;
    }
    return seasons[0] ?? null;
  }, [manualSeason, seasons]);

  /** All seasons in order — used for next/previous episode in the player (like live channel flip). */
  const orderedEpisodes = useMemo(() => {
    const data = info.data;
    if (!data?.episodes) return [] as { season: string; ep: SeriesEpisode }[];
    const seasonKeys = Object.keys(data.episodes).sort(
      (a, b) => parseInt(a, 10) - parseInt(b, 10)
    );
    const out: { season: string; ep: SeriesEpisode }[] = [];
    for (const season of seasonKeys) {
      const eps = data.episodes[season] || [];
      const sorted = [...eps].sort((a, b) => {
        const an = Number(a.episode_num);
        const bn = Number(b.episode_num);
        if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        return String(a.episode_num).localeCompare(String(b.episode_num), undefined, {
          numeric: true,
        });
      });
      for (const ep of sorted) out.push({ season, ep });
    }
    return out;
  }, [info.data]);

  const episodePlaylist = useMemo((): PlayerPlaylist | null => {
    if (!creds || seriesId == null) return null;
    const data = info.data;
    if (!data || orderedEpisodes.length === 0) return null;
    const show = data.info;
    if (!show?.name) return null;
    const items = orderedEpisodes.slice(0, 500).map(({ season, ep }) => {
      const ext = ep.container_extension || "mkv";
      return {
        kind: "series" as const,
        id: seriesId,
        streamId: parseInt(ep.id, 10),
        title: show.name,
        subtitle: `S${season} · E${ep.episode_num} — ${ep.title}`,
        poster: buildImageProxy(ep.info?.movie_image || show.cover),
        url: buildSeriesEpisodePlayUrl(creds, ep),
        containerExt: ext,
      };
    });
    return { kind: "series", items };
  }, [info.data, orderedEpisodes, seriesId, creds]);

  if (!creds) {
    return <SeriesDetailSkeleton />;
  }

  if (seriesId == null) {
    return (
      <div className="card p-10 text-center text-(--text-dim)">
        <p className="text-(--text)">That series link is invalid.</p>
        <Link
          href="/app/search"
          className="inline-block mt-4 text-(--brand-2) hover:underline"
        >
          Back to search
        </Link>
      </div>
    );
  }

  if (info.isLoading) {
    return <SeriesDetailSkeleton />;
  }

  if (info.isError || !info.data) {
    const hint =
      info.error instanceof Error ? info.error.message : "";
    return (
      <div className="card p-10 text-center text-(--text-dim) max-w-lg mx-auto space-y-4">
        <p className="text-(--text)">
          Couldn&apos;t load this series from your provider.
        </p>
        {hint ? (
          <p className="text-xs text-(--text-muted) break-words">{hint}</p>
        ) : null}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => void info.refetch()}
            className="btn-brand px-4 py-2 rounded-xl text-sm font-medium text-white"
          >
            Try again
          </button>
          <Link
            href="/app/search"
            className="inline-flex items-center px-4 py-2 rounded-xl border border-(--line) text-sm hover:bg-(--bg-3)"
          >
            Search
          </Link>
        </div>
      </div>
    );
  }

  const meta = info.data.info;
  if (!meta?.name) {
    return (
      <div className="card p-10 text-center text-(--text-dim) max-w-lg mx-auto space-y-4">
        <p className="text-(--text)">
          This series (ID {seriesId}) has no usable title from your provider.
        </p>
        <button
          type="button"
          onClick={() => void info.refetch()}
          className="btn-brand px-4 py-2 rounded-xl text-sm font-medium text-white"
        >
          Reload
        </button>
        <Link href="/app/series" className="block text-(--brand-2) hover:underline">
          Back to series
        </Link>
      </div>
    );
  }
  const fav = isFavorite("series", seriesId);
  const episodes = activeSeason ? info.data.episodes[activeSeason] || [] : [];
  const backdrop = meta.backdrop_path?.[0];

  return (
    <div>
      {backdrop && (
        <div className="absolute inset-x-0 top-[60px] -z-10 h-[420px] overflow-hidden pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={buildImageProxy(backdrop)}
            alt=""
            className="size-full object-cover opacity-25"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-(--bg-0)/70 to-(--bg-0)" />
        </div>
      )}

      <Link
        href="/app/series"
        className="inline-flex items-center gap-2 text-sm text-(--text-dim) hover:text-(--text) mb-6"
      >
        <ArrowLeft className="size-4" /> Back to series
      </Link>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 md:col-span-4 lg:col-span-3">
          <div className="card overflow-hidden">
            <div className="aspect-[2/3] bg-(--bg-3) relative">
              {!imgErr && meta.cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={buildImageProxy(meta.cover)}
                  alt={meta.name}
                  onError={() => setImgErr(true)}
                  className="size-full object-cover"
                />
              ) : (
                <div className="size-full grid place-items-center text-(--text-muted) text-sm">
                  No poster
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-8 lg:col-span-9 min-w-0">
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
            {meta.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-(--text-dim)">
            {(meta.releaseDate || meta.release_date) && (
              <span>{(meta.releaseDate || meta.release_date)?.slice(0, 4)}</span>
            )}
            {meta.episode_run_time && (
              <span className="chip">{meta.episode_run_time} min ep</span>
            )}
            {meta.genre && <span className="chip">{meta.genre}</span>}
            {meta.rating && parseFloat(meta.rating) > 0 && (
              <span className="chip flex items-center gap-1.5 text-amber-300">
                <Star className="size-3.5 fill-amber-300" /> {meta.rating}
              </span>
            )}
          </div>

          {meta.plot && (
            <p className="text-(--text) mt-5 leading-relaxed max-w-3xl">
              {meta.plot}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 mt-6 text-sm max-w-xl">
            {meta.cast && <Row label="Cast" value={meta.cast} />}
            {meta.director && <Row label="Director" value={meta.director} />}
          </dl>

          <div className="mt-7 flex items-center gap-2">
            <button
              onClick={() =>
                toggleFavorite({
                  kind: "series",
                  id: seriesId,
                  name: meta.name,
                  icon: meta.cover,
                })
              }
              className={
                "inline-flex items-center gap-2 h-11 px-4 rounded-xl border transition-colors text-sm " +
                (fav
                  ? "bg-(--danger)/15 border-(--danger)/30 text-(--danger)"
                  : "bg-white/5 border-white/10 text-(--text) hover:bg-white/10")
              }
            >
              <Heart className={"size-4 " + (fav ? "fill-current" : "")} />
              {fav ? "In Favorites" : "Add to Favorites"}
            </button>
          </div>
        </div>
      </div>

      {/* Seasons + Episodes */}
      <div className="mt-10">
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4">
          {seasons.map((s) => (
            <button
              key={s}
              onClick={() => setManualSeason(s)}
              className={cn(
                "h-9 px-4 rounded-xl text-sm whitespace-nowrap transition-colors",
                activeSeason === s
                  ? "btn-brand"
                  : "bg-(--bg-2) text-(--text-dim) hover:text-(--text) hover:bg-(--bg-3) border border-(--line)"
              )}
            >
              Season {s}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          {episodes.map((ep) => {
            const extHint = vodContainerUiHint(ep.container_extension);
            const extLabel = normalizeContainerExt(ep.container_extension);
            return (
              <button
                key={ep.id}
                onClick={() => {
                  const ext = ep.container_extension || "mkv";
                  play(
                    {
                      kind: "series",
                      id: seriesId,
                      streamId: parseInt(ep.id, 10),
                      title: meta.name,
                      subtitle: `S${activeSeason} · E${ep.episode_num} — ${ep.title}`,
                      poster: buildImageProxy(ep.info?.movie_image || meta.cover),
                      url: buildSeriesEpisodePlayUrl(creds, ep),
                      containerExt: ext,
                    },
                    episodePlaylist ? { playlist: episodePlaylist } : undefined
                  );
                  addRecent({
                    kind: "series",
                    id: seriesId,
                    name: meta.name,
                    icon: meta.cover,
                  });
                }}
                className="w-full text-left card p-3 flex items-center gap-4 hover:border-(--line-2) hover:bg-(--bg-3) transition-colors group"
              >
                <div className="size-20 sm:size-28 shrink-0 rounded-lg overflow-hidden bg-(--bg-3) relative">
                  {/* CSS background-image: silently skips broken URLs, no red-box indicator.
                      Falls back to series cover when the episode has no dedicated image. */}
                  {(ep.info?.movie_image || meta.cover) && (
                    <div
                      className="absolute inset-0"
                      style={{
                        backgroundImage: `url("${buildImageProxy(ep.info?.movie_image || meta.cover)}")`,
                        backgroundSize: ep.info?.movie_image ? "cover" : "contain",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                      }}
                    />
                  )}
                  <div className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/35 transition-colors">
                    <div className="size-9 rounded-full btn-brand grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="size-4 fill-white" />
                    </div>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm text-(--text-muted)">
                      Episode {ep.episode_num}
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded-md border shrink-0 tabular-nums",
                        extHint === "risky" &&
                          "border-amber-500/45 text-amber-100/95 bg-amber-500/12",
                        extHint === "mp4" &&
                          "border-(--line) text-(--text-muted) bg-(--bg-3)",
                        extHint === "other" &&
                          "border-(--line) text-(--text-muted) bg-(--bg-3)"
                      )}
                      title={
                        extHint === "risky"
                          ? "This container type often won't play inside a web browser. Native IPTV apps or VLC usually work."
                          : extHint === "mp4"
                            ? "MP4 is most likely to play in your browser; codec still depends on the file."
                            : "Playback in the browser depends on the codecs inside the file."
                      }
                    >
                      {extLabel}
                    </span>
                  </div>
                  <div className="font-medium text-(--text) truncate">
                    {ep.title}
                  </div>
                  {ep.info?.plot && (
                    <div className="text-xs text-(--text-dim) line-clamp-2 mt-1">
                      {ep.info.plot}
                    </div>
                  )}
                </div>
                {ep.info?.duration && (
                  <div className="text-xs text-(--text-muted) shrink-0 hidden sm:block">
                    {ep.info.duration}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-(--text-muted)">{label}</dt>
      <dd className="text-(--text) truncate">{value}</dd>
    </>
  );
}
