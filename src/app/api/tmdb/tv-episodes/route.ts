import {
  parseSeasonList,
  pickTvSeriesId,
  type EpisodeTitleCatalog,
  type TvSearchHit,
} from "@/lib/tmdb-episode-titles";
import { extractYear } from "@/lib/discovery/normalize-title";
import { NextRequest, NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";

type TmdbEpisode = {
  episode_number?: number;
  name?: string | null;
};

async function tmdbFetch(path: string, token: string) {
  return fetch(`${TMDB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 86_400 },
  });
}

function emptyCatalog() {
  return NextResponse.json(
    { episodes: {} satisfies EpisodeTitleCatalog },
    { headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } }
  );
}

function catalogFromEpisodes(rows: TmdbEpisode[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const row of rows) {
    const num = row.episode_number;
    const name = row.name?.trim();
    if (num == null || !Number.isFinite(num) || num < 0 || !name) continue;
    if (/^episode\s*\d+$/i.test(name)) continue;
    out[String(Math.floor(num))] = name.slice(0, 180);
  }
  return out;
}

/**
 * Episode names for one series, keyed by season then episode number.
 * GET /api/tmdb/tv-episodes?title=&year=&seasons=1,2&tmdbId=&imdbId=
 */
export async function GET(req: NextRequest) {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) return emptyCatalog();

  const title = req.nextUrl.searchParams.get("title")?.trim() ?? "";
  const year =
    extractYear(req.nextUrl.searchParams.get("year")) ??
    extractYear(title) ??
    null;
  const tmdbParam = req.nextUrl.searchParams.get("tmdbId")?.trim() ?? "";
  const imdbParam = req.nextUrl.searchParams.get("imdbId")?.trim() ?? "";
  const seasons = parseSeasonList(req.nextUrl.searchParams.get("seasons"));
  if (!title && !/^\d+$/.test(tmdbParam) && !/^tt\d{5,}$/i.test(imdbParam)) {
    return emptyCatalog();
  }
  if (seasons.length === 0) return emptyCatalog();

  try {
    let tvId: number | null =
      /^\d+$/.test(tmdbParam) && tmdbParam !== "0" ? Number(tmdbParam) : null;

    if (tvId == null && /^tt\d{5,}$/i.test(imdbParam)) {
      const findRes = await tmdbFetch(
        `/find/${encodeURIComponent(imdbParam)}?external_source=imdb_id`,
        token
      );
      if (findRes.ok) {
        const found = (await findRes.json()) as {
          tv_results?: Array<{ id?: number }>;
        };
        const id = found.tv_results?.[0]?.id;
        if (id) tvId = id;
      }
    }

    if (tvId == null && title) {
      const qs = new URLSearchParams({
        query: title,
        include_adult: "false",
      });
      if (year) qs.set("first_air_date_year", year);
      const searchRes = await tmdbFetch(`/search/tv?${qs.toString()}`, token);
      if (searchRes.ok) {
        const searchData = (await searchRes.json()) as {
          results?: Array<{
            id?: number;
            name?: string;
            original_name?: string;
            first_air_date?: string;
          }>;
        };
        const hits: TvSearchHit[] = [];
        for (const row of searchData.results ?? []) {
          if (!row.id || !row.name) continue;
          hits.push({
            id: row.id,
            name: row.name,
            originalName: row.original_name,
            year: extractYear(row.first_air_date),
          });
        }
        tvId = pickTvSeriesId(title, year, hits);
      }
    }

    if (tvId == null) return emptyCatalog();

    const seasonsData = await Promise.all(
      seasons.map(async (season) => {
        const res = await tmdbFetch(`/tv/${tvId}/season/${season}`, token);
        if (!res.ok) return [String(season), {}] as const;
        const body = (await res.json()) as { episodes?: TmdbEpisode[] };
        return [String(season), catalogFromEpisodes(body.episodes ?? [])] as const;
      })
    );

    const episodes: EpisodeTitleCatalog = {};
    for (const [season, names] of seasonsData) {
      if (Object.keys(names).length > 0) episodes[season] = names;
    }

    return NextResponse.json(
      { episodes },
      { headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" } }
    );
  } catch {
    return emptyCatalog();
  }
}
