import { NextRequest, NextResponse } from "next/server";

import {
  isReviewPanelCreds,
  isReviewPanelEnabled,
} from "@/lib/review-panel/credentials";
import {
  REVIEW_LIVE_STREAMS,
  REVIEW_SERIES,
  REVIEW_VOD_STREAMS,
  reviewSeriesInfo,
} from "@/lib/review-panel/catalog";
import type { SeriesEpisode } from "@/lib/xtream-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseStreamFile(name: string): { id: number; ext: string } | null {
  const m = /^(\d+)\.([a-z0-9]+)$/i.exec(name);
  if (!m) return null;
  const id = Number(m[1]);
  if (!Number.isFinite(id)) return null;
  return { id, ext: m[2]!.toLowerCase() };
}

function reviewCredsFromPath(
  origin: string,
  username: string,
  password: string
) {
  return {
    server: `${origin}/api/review-panel`,
    username: decodeURIComponent(username),
    password: decodeURIComponent(password),
  };
}

function redirectTo(target: string) {
  return NextResponse.redirect(target, { status: 302 });
}

/**
 * Xtream-style stream paths for the review panel, e.g.
 * /api/review-panel/live/samsung_review/StreamlyReview2026/101.m3u8
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
) {
  if (!isReviewPanelEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const segments = (await ctx.params).path;
  if (segments.length < 4) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const [kind, username, password, file, ...rest] = segments;
  if (rest.length > 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const creds = reviewCredsFromPath(url.origin, username!, password!);
  if (!isReviewPanelCreds(creds)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = parseStreamFile(file!);
  if (!parsed) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (kind === "live") {
    const ch = REVIEW_LIVE_STREAMS.find((s) => s.stream_id === parsed.id);
    if (ch?.direct_source) return redirectTo(ch.direct_source);
    return NextResponse.json({ error: "Channel not found" }, { status: 404 });
  }

  if (kind === "movie") {
    const movie = REVIEW_VOD_STREAMS.find((s) => s.stream_id === parsed.id);
    if (movie?.direct_source) return redirectTo(movie.direct_source);
    return NextResponse.json({ error: "Movie not found" }, { status: 404 });
  }

  if (kind === "series") {
    for (const series of REVIEW_SERIES) {
      const info = reviewSeriesInfo(series.series_id);
      if (!info?.episodes) continue;
      for (const eps of Object.values(info.episodes)) {
        const ep = eps.find((e: SeriesEpisode) => Number(e.id) === parsed.id);
        if (ep?.direct_source) return redirectTo(ep.direct_source);
      }
    }
    return NextResponse.json({ error: "Episode not found" }, { status: 404 });
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
