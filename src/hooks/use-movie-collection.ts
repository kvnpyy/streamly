"use client";

import {
  collectionHasOtherTitles,
  nextCollectionMovie,
  type MatchedCollectionPart,
  type MovieCollectionResponse,
} from "@/lib/movie-collection";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { useQuery } from "@tanstack/react-query";

export type UseMovieCollectionParams = {
  enabled: boolean;
  creds: XtreamCredentials | null;
  title: string;
  year?: string;
  tmdbId?: string | null;
  streamId?: number;
  safe: boolean;
};

async function fetchMovieCollection(
  creds: XtreamCredentials,
  params: {
    title: string;
    year?: string;
    tmdbId?: string | null;
    streamId?: number;
    safe: boolean;
  },
  signal: AbortSignal
): Promise<MovieCollectionResponse> {
  const url = new URL("/api/tmdb/collection", window.location.origin);
  if (params.title) url.searchParams.set("title", params.title);
  if (params.year) url.searchParams.set("year", params.year);
  if (params.tmdbId) url.searchParams.set("tmdbId", params.tmdbId);
  if (params.streamId) url.searchParams.set("streamId", String(params.streamId));
  if (params.safe) url.searchParams.set("safe", "1");
  const res = await fetch(url.toString(), {
    headers: {
      "x-iptv-server": creds.server,
      "x-iptv-username": creds.username,
      "x-iptv-password": creds.password,
    },
    signal,
  });
  if (!res.ok) return { collectionName: null, parts: [] };
  const data = (await res.json()) as MovieCollectionResponse;
  return {
    collectionName: data.collectionName ?? null,
    parts: Array.isArray(data.parts) ? data.parts : [],
  };
}

export function useMovieCollection(p: UseMovieCollectionParams): {
  collectionName: string | null;
  parts: MatchedCollectionPart[];
  next: MatchedCollectionPart | null;
  hasOthers: boolean;
} {
  const title = p.title.trim();
  const year = p.year?.trim() || undefined;
  const tmdbId = p.tmdbId?.trim() || undefined;
  const query = useQuery({
    queryKey: [
      "movie-collection",
      p.creds?.server,
      p.creds?.username,
      p.streamId ?? 0,
      title,
      year ?? "",
      tmdbId ?? "",
      p.safe,
    ],
    queryFn: ({ signal }) =>
      fetchMovieCollection(
        p.creds!,
        {
          title,
          year,
          tmdbId,
          streamId: p.streamId,
          safe: p.safe,
        },
        signal
      ),
    enabled: p.enabled && !!p.creds && (!!tmdbId || title.length >= 2),
    staleTime: 30 * 60_000,
    gcTime: 60 * 60_000,
    refetchOnWindowFocus: false,
  });

  const parts = query.data?.parts ?? [];
  return {
    collectionName: query.data?.collectionName ?? null,
    parts,
    next: nextCollectionMovie(parts),
    hasOthers: collectionHasOtherTitles(parts),
  };
}
