import "server-only";

import { getDb } from "@/db";
import { discoveryTmdbCache } from "@/db/schema";
import type { TmdbTrendingCachePayload, TmdbTrendingItem } from "@/lib/discovery/types";
import { extractYear } from "@/lib/discovery/normalize-title";
import { eq } from "drizzle-orm";

const TMDB_BASE = "https://api.themoviedb.org/3";

type TmdbTrendingResponse = {
  results?: Array<{
    id: number;
    title?: string;
    name?: string;
    original_title?: string;
    original_name?: string;
    release_date?: string;
    first_air_date?: string;
    popularity?: number;
  }>;
};

function mapTmdbResults(
  data: TmdbTrendingResponse,
  mediaType: "movie" | "tv"
): TmdbTrendingItem[] {
  return (data.results ?? []).map((r) => {
    const title = (mediaType === "movie" ? r.title : r.name) || "";
    const originalTitle =
      mediaType === "movie" ? r.original_title : r.original_name;
    const date = mediaType === "movie" ? r.release_date : r.first_air_date;
    return {
      tmdbId: r.id,
      title: title.trim(),
      originalTitle: originalTitle?.trim() || undefined,
      year: extractYear(date),
      popularity: r.popularity ?? 0,
    };
  });
}

async function fetchTrending(
  mediaType: "movie" | "tv",
  token: string,
  region: string
): Promise<TmdbTrendingItem[]> {
  const path =
    mediaType === "movie"
      ? "/trending/movie/week"
      : "/trending/tv/week";
  const url = new URL(`${TMDB_BASE}${path}`);
  const code = region.toUpperCase();
  url.searchParams.set("region", code);
  const language =
    code === "GB" ? "en-GB" : code === "AU" ? "en-AU" : code === "MX" ? "es-MX" : "en-US";
  url.searchParams.set("language", language);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`TMDB ${path} failed: ${res.status}`);
  }
  const data = (await res.json()) as TmdbTrendingResponse;
  return mapTmdbResults(data, mediaType);
}

export type SyncTmdbTrendingResult = {
  region: string;
  movieCount: number;
  tvCount: number;
  syncedAt: Date;
};

export async function syncTmdbTrendingToDb(
  region = "US"
): Promise<SyncTmdbTrendingResult | null> {
  const token = process.env.TMDB_API_TOKEN?.trim();
  if (!token) return null;

  const db = getDb();
  const syncedAt = new Date();
  const tmdbRegion = region.toUpperCase();
  const [movies, tv] = await Promise.all([
    fetchTrending("movie", token, tmdbRegion),
    fetchTrending("tv", token, tmdbRegion),
  ]);

  const write = async (mediaType: "movie" | "tv", items: TmdbTrendingItem[]) => {
    const id = `${mediaType}:${region}`;
    const payload: TmdbTrendingCachePayload = { items };
    const existing = await db
      .select()
      .from(discoveryTmdbCache)
      .where(eq(discoveryTmdbCache.id, id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(discoveryTmdbCache)
        .set({
          payloadJson: JSON.stringify(payload),
          syncedAt,
        })
        .where(eq(discoveryTmdbCache.id, id));
    } else {
      await db.insert(discoveryTmdbCache).values({
        id,
        region,
        mediaType,
        payloadJson: JSON.stringify(payload),
        syncedAt,
      });
    }
  };

  await Promise.all([
    write("movie", movies),
    write("tv", tv),
  ]);

  return {
    region,
    movieCount: movies.length,
    tvCount: tv.length,
    syncedAt,
  };
}

export async function readTmdbTrendingFromDb(
  region = "US"
): Promise<{ movieTrending: TmdbTrendingItem[]; tvTrending: TmdbTrendingItem[]; syncedAt: Date | null }> {
  let rows: (typeof discoveryTmdbCache.$inferSelect)[];
  try {
    const db = getDb();
    rows = await db.select().from(discoveryTmdbCache);
  } catch (err) {
    console.warn("[tmdb] readTrendingFromDb skipped:", err);
    return { movieTrending: [], tvTrending: [], syncedAt: null };
  }

  const pick = (mediaType: "movie" | "tv") => {
    const code = region.toUpperCase();
    const row = rows.find((r) => r.id === `${mediaType}:${code}`);
    if (!row) return { items: [] as TmdbTrendingItem[], syncedAt: null as Date | null };
    try {
      const payload = JSON.parse(row.payloadJson) as TmdbTrendingCachePayload;
      return { items: payload.items ?? [], syncedAt: row.syncedAt };
    } catch {
      return { items: [], syncedAt: row.syncedAt };
    }
  };

  const movie = pick("movie");
  const tv = pick("tv");
  const syncedAt =
    movie.syncedAt && tv.syncedAt
      ? new Date(Math.max(movie.syncedAt.getTime(), tv.syncedAt.getTime()))
      : movie.syncedAt ?? tv.syncedAt;

  return {
    movieTrending: movie.items,
    tvTrending: tv.items,
    syncedAt,
  };
}
