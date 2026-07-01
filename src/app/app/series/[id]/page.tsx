"use client";

import {
  cn,
  formatTime,
  normalizeContainerExt,
  parsePositiveRouteId,
  vodContainerUiHint,
} from "@/lib/utils";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { proxiedCssBackground } from "@/lib/image-proxy";
import {
  findSeriesResumeTarget,
  seriesEpisodeRecentMeta,
  seriesEpisodeWatchState,
} from "@/lib/continue-watching";
import { MY_LIST_LABEL } from "@/lib/my-list";
import { buildImageProxy, buildSeriesEpisodePlayUrl, xtream } from "@/lib/xtream";
import { resolveSeriesEpisodePlayUrl } from "@/lib/vod-format-probe";
import { inferVodContainerExtFromProxyUrl, warmVodTranscodePlay } from "@/lib/vod-transcode-url";
import type { SeriesEpisode } from "@/lib/xtream-types";
import { useAuth } from "@/store/auth";
import { usePlayer, type PlayerPlaylist } from "@/store/player";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import { CastGallery } from "@/components/CastGallery";
import { SimilarTitlesShelf } from "@/components/SimilarTitlesShelf";
import { VirtualEpisodeList } from "@/components/VirtualEpisodeList";
import { GenreChips } from "@/components/GenreChips";
import { seriesCategoryPreviewQueryOptions } from "@/lib/catalog-items-search";
import { pickSimilarSeries } from "@/lib/similar-titles";
import { ArrowLeft, Check, Heart, Play, Star } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

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
  const tvBrowser = useTvBrowser();
  const {
    isFavorite,
    toggleFavorite,
    addRecent,
    vodResumeSec,
    hideAdult,
    parentalUnlocked,
  } = usePrefs();
  const [imgErr, setImgErr] = useState(false);
  const accountKey = useMemo(
    () => (creds ? browseAccountKey(creds) : ""),
    [creds]
  );

  const info = useQuery({
    queryKey: ["series-info", creds?.server, creds?.username, seriesId],
    queryFn: ({ signal }) => xtream.seriesInfo(creds!, seriesId!, signal),
    enabled: Boolean(creds && seriesId != null),
    retry: 2,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
  });

  const categoryId =
    info.data?.info?.category_id != null
      ? String(info.data.info.category_id)
      : undefined;

  const categoryPreview = useQuery(
    seriesCategoryPreviewQueryOptions(
      creds!,
      categoryId,
      Boolean(creds && seriesId != null && info.data && categoryId)
    )
  );

  const similarSeries = useMemo(() => {
    const meta = info.data?.info;
    if (!meta || seriesId == null) return [];
    return pickSimilarSeries(
      categoryPreview.data?.items,
      seriesId,
      meta.genre,
      { hideAdult, parentalUnlocked }
    );
  }, [
    info.data,
    categoryPreview.data?.items,
    seriesId,
    hideAdult,
    parentalUnlocked,
  ]);

  const seasons = useMemo(() => {
    if (!info.data) return [] as string[];
    return Object.keys(info.data.episodes || {}).sort(
      (a, b) => parseInt(a, 10) - parseInt(b, 10)
    );
  }, [info.data]);

  const [manualSeason, setManualSeason] = useState<string | null>(null);

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

  const resumeTarget = useMemo(() => {
    if (!accountKey || seriesId == null || orderedEpisodes.length === 0) {
      return null;
    }
    return findSeriesResumeTarget(
      accountKey,
      seriesId,
      orderedEpisodes,
      vodResumeSec
    );
  }, [accountKey, seriesId, orderedEpisodes, vodResumeSec]);

  const resumeStreamId = resumeTarget
    ? parseInt(resumeTarget.episode.id, 10)
    : null;

  const seasonsWithProgress = useMemo(() => {
    if (!accountKey || seriesId == null) return new Set<string>();
    const out = new Set<string>();
    for (const { season, ep } of orderedEpisodes) {
      const watch = seriesEpisodeWatchState(
        accountKey,
        seriesId,
        ep,
        vodResumeSec
      );
      if (watch.status === "in_progress") out.add(season);
    }
    return out;
  }, [accountKey, seriesId, orderedEpisodes, vodResumeSec]);

  const activeSeason = useMemo(() => {
    if (manualSeason != null && seasons.includes(manualSeason)) {
      return manualSeason;
    }
    if (resumeTarget && seasons.includes(resumeTarget.season)) {
      return resumeTarget.season;
    }
    return seasons[0] ?? null;
  }, [manualSeason, seasons, resumeTarget]);

  const episodePlaylist = useMemo((): PlayerPlaylist | null => {
    if (!creds || seriesId == null) return null;
    const data = info.data;
    if (!data || orderedEpisodes.length === 0) return null;
    const show = data.info;
    if (!show?.name) return null;
    const items = orderedEpisodes.slice(0, 500).map(({ season, ep }) => {
      const playUrl = buildSeriesEpisodePlayUrl(creds, ep);
      const ext = inferVodContainerExtFromProxyUrl(
        playUrl,
        ep.container_extension || "mkv"
      );
      return {
        kind: "series" as const,
        id: seriesId,
        streamId: parseInt(ep.id, 10),
        title: show.name,
        subtitle: `S${season} · E${ep.episode_num} — ${ep.title}`,
        poster: buildImageProxy(ep.info?.movie_image || show.cover),
        url: playUrl,
        containerExt: ext,
      };
    });
    return { kind: "series", items };
  }, [info.data, orderedEpisodes, seriesId, creds]);

  const playEpisode = useCallback(
    (season: string, ep: SeriesEpisode) => {
      const show = info.data?.info;
      if (!creds || seriesId == null || !show?.name) return;
      void (async () => {
        const { proxyUrl, containerExt } = await resolveSeriesEpisodePlayUrl(
          creds,
          ep
        );
        warmVodTranscodePlay(proxyUrl, { compatMse: tvBrowser });
        play(
          {
            kind: "series",
            id: seriesId,
            streamId: parseInt(ep.id, 10),
            title: show.name,
            subtitle: `S${season} · E${ep.episode_num} — ${ep.title}`,
            poster: buildImageProxy(ep.info?.movie_image || show.cover),
            url: proxyUrl,
            containerExt,
          },
          episodePlaylist ? { playlist: episodePlaylist } : undefined
        );
        addRecent({
          kind: "series",
          id: seriesId,
          name: show.name,
          icon: show.cover,
          meta: seriesEpisodeRecentMeta(season, ep),
        });
      })();
    },
    [creds, seriesId, info.data, play, episodePlaylist, addRecent, tvBrowser]
  );

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
            {meta.rating && parseFloat(meta.rating) > 0 && (
              <span className="chip flex items-center gap-1.5 text-amber-300">
                <Star className="size-3.5 fill-amber-300" /> {meta.rating}
              </span>
            )}
          </div>

          <GenreChips genre={meta.genre} className="mt-3" />

          {meta.plot && (
            <p className="text-(--text) mt-5 leading-relaxed max-w-3xl">
              {meta.plot}
            </p>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 mt-6 text-sm max-w-xl">
            {meta.director && <Row label="Director" value={meta.director} />}
          </dl>

          <CastGallery
            title={meta.name}
            year={(meta.releaseDate || meta.release_date)?.slice(0, 4)}
            mediaType="tv"
            fallbackNames={meta.cast}
          />

          <div className="mt-7 flex flex-wrap items-center gap-2">
            {orderedEpisodes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const target =
                    resumeTarget ??
                    ({
                      season: orderedEpisodes[0]!.season,
                      episode: orderedEpisodes[0]!.ep,
                      resumeSec: 0,
                    } as const);
                  playEpisode(target.season, target.episode);
                }}
                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl btn-brand font-medium"
              >
                <Play className="size-4 fill-white" />
                {resumeTarget
                  ? `Continue S${resumeTarget.season} · E${resumeTarget.episode.episode_num}`
                  : orderedEpisodes[0]
                    ? `Play S${orderedEpisodes[0].season} · E${orderedEpisodes[0].ep.episode_num}`
                    : "Play"}
              </button>
            )}
            <button
              type="button"
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
              {fav ? `In ${MY_LIST_LABEL}` : `Add to ${MY_LIST_LABEL}`}
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
              <span className="inline-flex items-center gap-1.5">
                Season {s}
                {seasonsWithProgress.has(s) && activeSeason !== s && (
                  <span
                    className="size-1.5 rounded-full bg-(--danger)"
                    aria-label="In progress"
                  />
                )}
              </span>
            </button>
          ))}
        </div>

        <VirtualEpisodeList
          items={episodes}
          itemKey={(ep) => ep.id}
          renderItem={(ep) => {
            const extHint = vodContainerUiHint(ep.container_extension);
            const extLabel = normalizeContainerExt(ep.container_extension);
            const playUrl = buildSeriesEpisodePlayUrl(creds!, ep);
            const watch =
              accountKey && seriesId != null
                ? seriesEpisodeWatchState(
                    accountKey,
                    seriesId,
                    ep,
                    vodResumeSec
                  )
                : null;
            const epStreamId = parseInt(ep.id, 10);
            const isResumeEpisode =
              resumeStreamId != null &&
              Number.isFinite(epStreamId) &&
              epStreamId === resumeStreamId;
            const showProgress =
              watch?.progressPct != null && watch.progressPct > 0;
            const remainingSec =
              watch &&
              watch.durationSec > 0 &&
              watch.status === "in_progress"
                ? Math.max(0, watch.durationSec - watch.resumeSec)
                : null;
            const warmTranscode = () => {
              warmVodTranscodePlay(playUrl, { compatMse: tvBrowser });
            };
            return (
              <button
                key={ep.id}
                onFocus={warmTranscode}
                onMouseEnter={warmTranscode}
                onClick={() => playEpisode(activeSeason!, ep)}
                className={cn(
                  "w-full text-left card p-3 flex items-center gap-4 hover:border-(--line-2) hover:bg-(--bg-3) transition-colors group",
                  isResumeEpisode &&
                    "border-(--brand)/55 bg-(--brand)/10 ring-2 ring-(--brand)/30 border-l-4 border-l-(--brand)",
                  watch?.status === "completed" &&
                    !isResumeEpisode &&
                    "border-l-4 border-l-emerald-500/70"
                )}
              >
                <div className="size-20 sm:size-28 shrink-0 rounded-lg overflow-hidden bg-(--bg-3) relative">
                  {/* CSS background-image: silently skips broken URLs, no red-box indicator.
                      Falls back to series cover when the episode has no dedicated image. */}
                  {(() => {
                    const epBg = proxiedCssBackground(
                      ep.info?.movie_image || meta.cover
                    );
                    return epBg ? (
                      <div
                        className="absolute inset-0"
                        style={{
                          backgroundImage: epBg,
                          backgroundSize: ep.info?.movie_image ? "cover" : "contain",
                          backgroundPosition: "center",
                          backgroundRepeat: "no-repeat",
                        }}
                      />
                    ) : null;
                  })()}
                  {watch?.status === "completed" && (
                    <>
                      <div
                        className="absolute inset-0 bg-black/30 pointer-events-none"
                        aria-hidden
                      />
                      <div className="absolute top-1.5 left-1.5 z-10 inline-flex items-center gap-1 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white shadow-sm">
                        <Check className="size-3" strokeWidth={2.5} />
                        Done
                      </div>
                    </>
                  )}
                  {isResumeEpisode && (
                    <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-(--brand)/95 via-(--brand)/80 to-transparent px-2 pt-1.5 pb-5 pointer-events-none">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-white drop-shadow-sm">
                        Continue here
                      </span>
                    </div>
                  )}
                  <div className="absolute inset-0 grid place-items-center bg-black/0 group-hover:bg-black/35 transition-colors pointer-events-none">
                    <div className="size-9 rounded-full btn-brand grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="size-4 fill-white" />
                    </div>
                  </div>
                  {showProgress && (
                    <div
                      className="absolute bottom-0 left-0 right-0 z-10 h-2 bg-black/50 pointer-events-none"
                      aria-hidden
                    >
                      <div
                        className={cn(
                          "h-full transition-[width] duration-300 shadow-[0_0_8px_rgba(0,0,0,0.35)]",
                          watch!.status === "completed"
                            ? "bg-emerald-400"
                            : isResumeEpisode
                              ? "bg-(--brand)"
                              : "bg-(--danger)"
                        )}
                        style={{ width: `${watch!.progressPct}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <div className="text-sm text-(--text-muted)">
                      Episode {ep.episode_num}
                    </div>
                    {isResumeEpisode && (
                      <span className="text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg bg-(--brand) text-white shadow-[0_0_12px_rgba(124,92,255,0.45)]">
                        Continue watching
                      </span>
                    )}
                    {watch?.status === "completed" && !isResumeEpisode && (
                      <span className="text-[11px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-md border border-emerald-500/45 text-emerald-100 bg-emerald-500/20">
                        Watched
                      </span>
                    )}
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
                  {isResumeEpisode &&
                    remainingSec != null &&
                    remainingSec > 0 && (
                      <div className="text-xs text-(--brand) font-semibold mt-0.5 tabular-nums sm:hidden">
                        {formatTime(remainingSec)} left
                        {watch?.progressPct != null
                          ? ` · ${watch.progressPct}% watched`
                          : ""}
                      </div>
                    )}
                  {ep.info?.plot && (
                    <div className="text-xs text-(--text-dim) line-clamp-2 mt-1">
                      {ep.info.plot}
                    </div>
                  )}
                </div>
                <div className="shrink-0 hidden sm:flex flex-col items-end gap-0.5 text-xs tabular-nums">
                  {ep.info?.duration && (
                    <span className="text-(--text-muted)">{ep.info.duration}</span>
                  )}
                  {isResumeEpisode && remainingSec != null && remainingSec > 0 && (
                    <span className="text-(--brand) font-semibold">
                      {formatTime(remainingSec)} left
                    </span>
                  )}
                </div>
              </button>
            );
          }}
        />
      </div>

      <div className="mt-12">
        <SimilarTitlesShelf titles={similarSeries} kind="series" />
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
