import { NextRequest, NextResponse } from "next/server";

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMG = "https://image.tmdb.org/t/p";

/**
 * GET /api/artwork?title=The+Walking+Dead[&type=tv|movie]
 *
 * Server-side TMDB proxy — keeps the API token out of the browser.
 * Returns `{ imageUrl: string | null }`.
 *
 * Priority:
 *  1. 16:9 backdrop (ideal for channel card logo areas)
 *  2. 2:3 poster as fallback
 *  3. null when nothing useful is found
 *
 * Results are cached for 24 hours via Next.js fetch cache and the
 * Cache-Control response header so repeat requests are free.
 */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get("title")?.trim();
  const TOKEN = process.env.TMDB_API_TOKEN;

  // Graceful no-op when token is not configured
  if (!title || !TOKEN) {
    return NextResponse.json({ imageUrl: null });
  }

  try {
    // search/multi covers TV shows, movies, and people — pick the best visual match
    const searchRes = await fetch(
      `${TMDB_BASE}/search/multi?query=${encodeURIComponent(title)}&page=1&include_adult=false`,
      {
        headers: { Authorization: `Bearer ${TOKEN}` },
        // Next.js server-side cache — revalidate daily
        next: { revalidate: 86_400 },
      }
    );

    if (!searchRes.ok) {
      return NextResponse.json({ imageUrl: null });
    }

    const data = (await searchRes.json()) as {
      results?: Array<{
        media_type?: string;
        backdrop_path?: string | null;
        poster_path?: string | null;
        popularity?: number;
      }>;
    };

    const results = data.results ?? [];

    // Filter to visual media only (TV + movies), sort by popularity descending
    const media = results
      .filter((r) => r.media_type === "tv" || r.media_type === "movie")
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));

    if (media.length === 0) {
      return NextResponse.json({ imageUrl: null }, {
        headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
      });
    }

    // Prefer a result with a backdrop (16:9); fall back to poster
    const withBackdrop = media.find((r) => r.backdrop_path);
    const best = withBackdrop ?? media[0];

    // w780 backdrop gives sharp 16:9 art without oversized payloads
    const path = best?.backdrop_path
      ? `${TMDB_IMG}/w780${best.backdrop_path}`
      : best?.poster_path
        ? `${TMDB_IMG}/w342${best.poster_path}`
        : null;

    return NextResponse.json(
      { imageUrl: path },
      {
        headers: {
          "Cache-Control": "public, max-age=86400, s-maxage=86400",
        },
      }
    );
  } catch {
    return NextResponse.json({ imageUrl: null });
  }
}
