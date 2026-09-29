import { getCachedVodCatalogEntry } from "@/lib/vod-catalog-server-cache";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";
import {
  matchCollectionParts,
  type MovieCollectionResponse,
  type TmdbCollectionPart,
} from "@/lib/movie-collection";
import { extractYear } from "@/lib/discovery/normalize-title";
import { looksAdult } from "@/lib/utils";
import type { VodStream } from "@/lib/xtream-types";
import { NextRequest, NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p/w342";
const TMDB_TTL_MS = 24 * 60 * 60 * 1000;

type TmdbMovieHit = {
  id: number;
  release_date?: string;
  belongs_to_collection?: { id: number; name?: string } | null;
};

type CachedCollection = {
  name: string | null;
  parts: TmdbCollectionPart[];
  at: number;
};

const collectionCache = new Map<number, CachedCollection>();
const responseCache = new Map<
  string,
  { catalogAt: number; body: MovieCollectionResponse }
>();

function emptyCollection(): MovieCollectionResponse {
  return { collectionName: null, parts: [] };
}

async function tmdbGet(path: string, token: string): Promise<Response> {
  return fetch(`${TMDB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(8_000),
  });
}

function yearOf(releaseDate: string | undefined): string | undefined {
  if (!releaseDate || !/^\d{4}/.test(releaseDate)) return undefined;
  return releaseDate.slice(0, 4);
}

function posterOf(path: string | null | undefined): string | null {
  if (!path) return null;
  return `${TMDB_IMG}${path}`;
}

async function resolveMovieId(
  token: string,
  tmdbId: string | null,
  title: string,
  year: string | null
): Promise<number | null> {
  if (tmdbId && /^\d+$/.test(tmdbId) && tmdbId !== "0") return Number(tmdbId);
  if (!title) return null;
  const qs = new URLSearchParams({
    query: title,
    include_adult: "false",
  });
  if (year && /^\d{4}$/.test(year)) qs.set("year", year);
  const res = await tmdbGet(`/search/movie?${qs.toString()}`, token);
  if (!res.ok) return null;
  const data = (await res.json()) as { results?: TmdbMovieHit[] };
  const results = data.results ?? [];
  if (year) {
    const dated = results.find((r) => yearOf(r.release_date) === year);
    if (dated) return dated.id;
  }
  return results[0]?.id ?? null;
}

async function loadCollection(
  token: string,
  movieId: number
): Promise<CachedCollection> {
  const hit = collectionCache.get(movieId);
  if (hit && Date.now() - hit.at < TMDB_TTL_MS) return hit;

  const movieRes = await tmdbGet(`/movie/${movieId}`, token);
  if (!movieRes.ok) return { name: null, parts: [], at: Date.now() };
  const movie = (await movieRes.json()) as TmdbMovieHit;
  const collectionId = movie.belongs_to_collection?.id;
  if (!collectionId) {
    const empty = { name: null, parts: [], at: Date.now() };
    collectionCache.set(movieId, empty);
    return empty;
  }

  const colRes = await tmdbGet(`/collection/${collectionId}`, token);
  if (!colRes.ok) return { name: null, parts: [], at: Date.now() };
  const col = (await colRes.json()) as {
    name?: string;
    parts?: Array<{
      id: number;
      title?: string;
      original_title?: string;
      release_date?: string;
      poster_path?: string | null;
    }>;
  };
  const parts = (col.parts ?? [])
    .filter((p) => p.id && p.title)
    .map((p) => ({
      tmdbId: p.id,
      title: p.title!,
      originalTitle: p.original_title,
      year: yearOf(p.release_date),
      posterUrl: posterOf(p.poster_path),
    }))
    .sort((a, b) => (a.year ?? "9999").localeCompare(b.year ?? "9999"));

  const cached: CachedCollection = {
    name: col.name?.trim() || movie.belongs_to_collection?.name?.trim() || null,
    parts,
    at: Date.now(),
  };
  collectionCache.set(movieId, cached);
  return cached;
}

function catalogMovies(streams: VodStream[]) {
  return streams.map((s) => ({
    streamId: s.stream_id,
    name: s.name || s.title || "",
    year: s.year || extractYear(s.name),
    icon: s.stream_icon,
    containerExtension: s.container_extension,
    directSource: s.direct_source,
    adult: looksAdult({ name: s.name, is_adult: s.is_adult }),
  }));
}

/**
 * GET /api/tmdb/collection?title=&year=&tmdbId=&streamId=&safe=1
 * Parts of a movie series that exist in this library, in release order.
 */
export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;

  const token = process.env.TMDB_API_TOKEN?.trim();
  if (!token) {
    return NextResponse.json(emptyCollection());
  }

  const title = req.nextUrl.searchParams.get("title")?.trim() ?? "";
  const year = req.nextUrl.searchParams.get("year")?.trim() || null;
  const tmdbId = req.nextUrl.searchParams.get("tmdbId")?.trim() || null;
  const streamRaw = req.nextUrl.searchParams.get("streamId")?.trim();
  const streamId = streamRaw && /^\d+$/.test(streamRaw) ? Number(streamRaw) : undefined;
  const hideAdult = req.nextUrl.searchParams.get("safe") === "1";

  try {
    const movieId = await resolveMovieId(token, tmdbId, title, year);
    if (!movieId) return NextResponse.json(emptyCollection());
    const collection = await loadCollection(token, movieId);
    if (!collection.parts.length) return NextResponse.json(emptyCollection());

    const catalogEntry = await getCachedVodCatalogEntry(credsOrRes);
    const responseKey = `${credsOrRes.server}|${credsOrRes.username}|${movieId}|${streamId ?? 0}|${hideAdult ? 1 : 0}`;
    const cachedResponse = responseCache.get(responseKey);
    if (cachedResponse && cachedResponse.catalogAt === catalogEntry.at) {
      return NextResponse.json(cachedResponse.body, {
        headers: { "Cache-Control": "private, max-age=3600" },
      });
    }
    const parts = matchCollectionParts({
      parts: collection.parts,
      catalog: catalogMovies(catalogEntry.bundle.streams),
      currentStreamId: streamId,
      currentTmdbId: movieId,
      hideAdult,
    });
    const body: MovieCollectionResponse = {
      collectionName: collection.name,
      parts,
    };
    if (responseCache.size > 300) responseCache.clear();
    responseCache.set(responseKey, { catalogAt: catalogEntry.at, body });
    return NextResponse.json(body, {
      headers: { "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json(emptyCollection());
  }
}
