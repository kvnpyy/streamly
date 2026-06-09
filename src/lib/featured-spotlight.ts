import {
  CONTINUE_PROGRESS_MIN_SEC,
  recentResumeStorageKey,
} from "@/lib/continue-watching";
import type { RecentItem } from "@/store/preferences";

export type SpotlightKind = "movie" | "series" | "live";

export type FeaturedSpotlight = {
  kind: SpotlightKind;
  id: number;
  title: string;
  subtitle?: string;
  poster?: string;
  eyebrow: string;
  ctaLabel: string;
  detailHref: string;
  hasResume: boolean;
};

function resumeScore(
  accountKey: string,
  recent: RecentItem,
  vodResumeSec: Record<string, number>
): number {
  const key = recentResumeStorageKey(accountKey, recent);
  if (!key) return 0;
  const sec = vodResumeSec[key];
  if (sec == null || sec < CONTINUE_PROGRESS_MIN_SEC) return 0;
  return sec;
}

/**
 * Pick a single hero title for the home spotlight.
 * Priority: in-progress VOD → recent movie → recent series → live.
 */
export function pickFeaturedSpotlight(
  recents: RecentItem[],
  accountKey: string,
  vodResumeSec: Record<string, number>
): FeaturedSpotlight | null {
  if (!recents.length) return null;

  let bestResume: { recent: RecentItem; score: number } | null = null;
  for (const r of recents) {
    if (r.kind === "live") continue;
    const score = resumeScore(accountKey, r, vodResumeSec);
    if (score > 0 && (!bestResume || r.lastAt > bestResume.recent.lastAt)) {
      bestResume = { recent: r, score };
    }
  }

  if (bestResume) {
    const r = bestResume.recent;
    return spotlightFromRecent(r, true);
  }

  const movie = recents.find((r) => r.kind === "movie");
  if (movie) return spotlightFromRecent(movie, false);

  const series = recents.find((r) => r.kind === "series");
  if (series) return spotlightFromRecent(series, false);

  const live = recents.find((r) => r.kind === "live");
  if (live) return spotlightFromRecent(live, false);

  return null;
}

function spotlightFromRecent(
  recent: RecentItem,
  hasResume: boolean
): FeaturedSpotlight {
  if (recent.kind === "live") {
    return {
      kind: "live",
      id: recent.id,
      title: recent.name,
      subtitle: "Live TV",
      poster: recent.icon,
      eyebrow: "On your list",
      ctaLabel: "Watch live",
      detailHref: "/app/live",
      hasResume: false,
    };
  }

  const detailHref =
    recent.kind === "movie"
      ? `/app/movies/${recent.id}`
      : `/app/series/${recent.id}`;

  return {
    kind: recent.kind,
    id: recent.id,
    title: recent.name,
    subtitle: recent.kind === "movie" ? "Movie" : "Series",
    poster: recent.icon,
    eyebrow: hasResume ? "Continue watching" : "Pick up again",
    ctaLabel: hasResume ? "Resume" : "Play",
    detailHref,
    hasResume,
  };
}
