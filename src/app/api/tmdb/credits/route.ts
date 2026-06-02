import type { TmdbCastMember, TmdbCreditsResponse } from "@/lib/tmdb-credits-types";
import { NextRequest, NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

type TmdbCastRaw = {
  id: number;
  name: string;
  character?: string;
  profile_path?: string | null;
  order?: number;
};

function mapCast(rows: TmdbCastRaw[], limit: number): TmdbCastMember[] {
  return rows
    .filter((r) => r.name)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99))
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      name: r.name,
      character: r.character,
      profileUrl: r.profile_path
        ? `${TMDB_IMG}/w185${r.profile_path}`
        : null,
    }));
}

async function tmdbFetch(path: string, token: string) {
  return fetch(`${TMDB_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    next: { revalidate: 86_400 },
  });
}

/**
 * GET /api/tmdb/credits?tmdbId=123&type=movie
 * GET /api/tmdb/credits?title=Inception&year=2010&type=movie
 */
export async function GET(req: NextRequest) {
  const token = process.env.TMDB_API_TOKEN;
  if (!token) {
    return NextResponse.json({ cast: [] } satisfies TmdbCreditsResponse);
  }

  const tmdbId = req.nextUrl.searchParams.get("tmdbId")?.trim();
  const title = req.nextUrl.searchParams.get("title")?.trim();
  const year = req.nextUrl.searchParams.get("year")?.trim();
  const type = req.nextUrl.searchParams.get("type") === "tv" ? "tv" : "movie";

  try {
    let creditsPath: string | null = null;

    if (tmdbId && /^\d+$/.test(tmdbId)) {
      creditsPath = `/${type}/${tmdbId}/credits`;
    } else if (title) {
      const searchType = type === "tv" ? "tv" : "movie";
      const qs = new URLSearchParams({
        query: title,
        include_adult: "false",
      });
      if (year && /^\d{4}$/.test(year)) {
        qs.set("year", year);
      }
      const searchRes = await tmdbFetch(
        `/search/${searchType}?${qs.toString()}`,
        token
      );
      if (!searchRes.ok) {
        return NextResponse.json({ cast: [] } satisfies TmdbCreditsResponse);
      }
      const searchData = (await searchRes.json()) as {
        results?: Array<{ id: number }>;
      };
      const id = searchData.results?.[0]?.id;
      if (!id) {
        return NextResponse.json({ cast: [] } satisfies TmdbCreditsResponse);
      }
      creditsPath = `/${searchType}/${id}/credits`;
    }

    if (!creditsPath) {
      return NextResponse.json({ cast: [] } satisfies TmdbCreditsResponse);
    }

    const creditsRes = await tmdbFetch(creditsPath, token);
    if (!creditsRes.ok) {
      return NextResponse.json({ cast: [] } satisfies TmdbCreditsResponse);
    }

    const creditsData = (await creditsRes.json()) as {
      cast?: TmdbCastRaw[];
    };

    const cast = mapCast(creditsData.cast ?? [], 12);

    return NextResponse.json(
      { cast } satisfies TmdbCreditsResponse,
      {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      }
    );
  } catch {
    return NextResponse.json({ cast: [] } satisfies TmdbCreditsResponse);
  }
}
