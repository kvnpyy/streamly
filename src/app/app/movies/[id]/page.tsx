"use client";

import { parsePositiveRouteId } from "@/lib/utils";
import { buildImageProxy, buildStreamUrl, xtream } from "@/lib/xtream";
import { vodResumeStorageKey } from "@/lib/player-vod-resume";
import { MY_LIST_LABEL } from "@/lib/my-list";
import { CONTINUE_PROGRESS_MIN_SEC } from "@/lib/continue-watching";
import { useAuth } from "@/store/auth";
import { usePlayer } from "@/store/player";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useQuery } from "@tanstack/react-query";
import { CastGallery } from "@/components/CastGallery";
import { GenreChips } from "@/components/GenreChips";
import { SimilarTitlesShelf } from "@/components/SimilarTitlesShelf";
import { vodCategoryPreviewQueryOptions } from "@/lib/catalog-items-search";
import { pickSimilarMovies } from "@/lib/similar-titles";
import { ArrowLeft, Heart, Play, Star } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";

export default function MovieDetail() {
  const params = useParams<{ id: string }>();
  const movieId = parsePositiveRouteId(params.id);
  const creds = useAuth((s) => s.creds);
  const { play } = usePlayer();
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
    queryKey: ["vod-info", creds?.server, creds?.username, movieId],
    queryFn: ({ signal }) => xtream.vodInfo(creds!, movieId!, signal),
    enabled: !!creds && movieId != null,
    retry: 2,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 8000),
  });

  const categoryId =
    info.data?.movie_data?.category_id != null
      ? String(info.data.movie_data.category_id)
      : undefined;

  const categoryPreview = useQuery(
    vodCategoryPreviewQueryOptions(
      creds!,
      categoryId,
      Boolean(creds && movieId != null && info.data && categoryId)
    )
  );

  const similarMovies = useMemo(() => {
    const meta = info.data?.info;
    const data = info.data?.movie_data;
    if (!meta || !data) return [];
    return pickSimilarMovies(
      categoryPreview.data?.items,
      data.stream_id,
      data.category_id,
      meta.genre,
      { hideAdult, parentalUnlocked }
    );
  }, [info.data, categoryPreview.data?.items, hideAdult, parentalUnlocked]);

  if (!creds) {
    return null;
  }

  if (movieId == null) {
    return (
      <div className="card p-10 text-center text-(--text-dim)">
        <p className="text-(--text)">That movie link is invalid.</p>
        <Link href="/app/search" className="inline-block mt-4 text-(--brand-2) hover:underline">
          Back to search
        </Link>
      </div>
    );
  }

  if (info.isLoading) {
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
            <div className="skeleton h-4 w-full" />
            <div className="skeleton h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  if (info.isError || !info.data) {
    const hint = info.error instanceof Error ? info.error.message : "";
    return (
      <div className="card p-10 text-center text-(--text-dim) max-w-lg mx-auto space-y-4">
        <p className="text-(--text)">Couldn&apos;t load this movie from your provider.</p>
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
  const data = info.data.movie_data;
  if (!meta || !data) {
    return (
      <div className="card p-10 text-center text-(--text-dim) max-w-lg mx-auto space-y-4">
        <p className="text-(--text)">
          Your panel returned incomplete movie metadata (ID {movieId}).
        </p>
        <button
          type="button"
          onClick={() => void info.refetch()}
          className="btn-brand px-4 py-2 rounded-xl text-sm font-medium text-white"
        >
          Reload
        </button>
        <Link href="/app/movies" className="block text-(--brand-2) hover:underline">
          Back to movies
        </Link>
      </div>
    );
  }
  const poster = meta.movie_image || meta.cover_big;
  const backdrop = meta.backdrop_path?.[0];
  const ext = data.container_extension || meta.container_extension || "mp4";
  const fav = isFavorite("movie", data.stream_id);
  const resumeKey =
    accountKey && creds
      ? vodResumeStorageKey(accountKey, {
          kind: "movie",
          id: data.stream_id,
          title: meta.name || data.name,
          url: "",
        })
      : null;
  const hasResume =
    resumeKey != null &&
    (vodResumeSec[resumeKey] ?? 0) >= CONTINUE_PROGRESS_MIN_SEC;

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
        href="/app/movies"
        className="inline-flex items-center gap-2 text-sm text-(--text-dim) hover:text-(--text) mb-6"
      >
        <ArrowLeft className="size-4" /> Back to movies
      </Link>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 md:col-span-4 lg:col-span-3">
          <div className="card overflow-hidden">
            <div className="aspect-[2/3] bg-(--bg-3) relative">
              {!imgErr && poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={buildImageProxy(poster)}
                  alt={meta.name || data.name}
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
            {meta.name || data.name}
          </h1>

          <div className="flex flex-wrap items-center gap-2 mt-3 text-sm text-(--text-dim)">
            {data.year && <span>{data.year}</span>}
            {meta.duration && <span className="chip">{meta.duration}</span>}
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
            {meta.director && (
              <Row label="Director" value={meta.director} />
            )}
            {(meta.releasedate || meta.release_date) && (
              <Row label="Released" value={meta.releasedate || meta.release_date!} />
            )}
          </dl>

          <CastGallery
            tmdbId={meta.tmdb_id}
            title={meta.name || data.name}
            year={data.year}
            mediaType="movie"
            fallbackNames={meta.cast}
          />

          <div className="mt-7 flex flex-wrap items-center gap-2">
            <button
              onClick={() => {
                const url = buildStreamUrl(creds, "movie", data.stream_id, ext);
                play({
                  kind: "movie",
                  id: data.stream_id,
                  title: meta.name || data.name,
                  subtitle: data.year,
                  poster: buildImageProxy(poster),
                  url,
                  containerExt: ext,
                });
                addRecent({
                  kind: "movie",
                  id: data.stream_id,
                  name: meta.name || data.name,
                  icon: poster,
                });
              }}
              className="inline-flex items-center gap-2 h-11 px-5 rounded-xl btn-brand font-medium"
            >
              <Play className="size-4 fill-white" /> {hasResume ? "Resume" : "Play"}
            </button>
            <button
              onClick={() =>
                toggleFavorite({
                  kind: "movie",
                  id: data.stream_id,
                  name: meta.name || data.name,
                  icon: poster,
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

      <div className="mt-12">
        <SimilarTitlesShelf titles={similarMovies} kind="movie" />
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
