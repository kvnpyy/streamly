import { NextRequest, NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";
const MAX_TITLES = 24;

async function resolveArtwork(
  title: string,
  token: string
): Promise<string | null> {
  const searchRes = await fetch(
    `${TMDB_BASE}/search/multi?query=${encodeURIComponent(title)}&page=1&include_adult=false`,
    {
      headers: { Authorization: `Bearer ${token}` },
      next: { revalidate: 86_400 },
    }
  );
  if (!searchRes.ok) return null;

  const data = (await searchRes.json()) as {
    results?: Array<{
      media_type?: string;
      backdrop_path?: string | null;
      poster_path?: string | null;
      popularity?: number;
    }>;
  };

  const media = (data.results ?? [])
    .filter((r) => r.media_type === "tv" || r.media_type === "movie")
    .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

  if (media.length === 0) return null;

  const withBackdrop = media.find((r) => r.backdrop_path);
  const best = withBackdrop ?? media[0];
  if (best?.backdrop_path) return `${TMDB_IMG}/w780${best.backdrop_path}`;
  if (best?.poster_path) return `${TMDB_IMG}/w342${best.poster_path}`;
  return null;
}

/**
 * POST /api/artwork/batch — `{ titles: string[] }` → `{ images: Record<title, url|null> }`
 */
export async function POST(req: NextRequest) {
  const TOKEN = process.env.TMDB_API_TOKEN;
  if (!TOKEN) {
    return NextResponse.json({ images: {} });
  }

  let titles: string[] = [];
  try {
    const body = (await req.json()) as { titles?: unknown };
    if (Array.isArray(body.titles)) {
      titles = body.titles
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, MAX_TITLES);
    }
  } catch {
    return NextResponse.json({ images: {} }, { status: 400 });
  }

  const unique = [...new Set(titles)];
  const images: Record<string, string | null> = {};

  await Promise.all(
    unique.map(async (title) => {
      try {
        images[title] = await resolveArtwork(title, TOKEN);
      } catch {
        images[title] = null;
      }
    })
  );

  return NextResponse.json(
    { images },
    {
      headers: {
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
      },
    }
  );
}
