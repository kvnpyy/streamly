import { vodResumeStorageKey } from "@/lib/player-vod-resume";
import { parsePositiveRouteId } from "@/lib/utils";
import {
  buildImageProxy,
  buildSeriesEpisodePlayUrl,
  buildStreamUrl,
} from "@/lib/xtream";
import type { SeriesEpisode } from "@/lib/xtream-types";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { PlayerSource } from "@/store/player";
import type { RecentItem } from "@/store/preferences";

export const CONTINUE_WATCHING_PATH = "/app/continue";

/** Minimum resume seconds before we show a progress bar (matches player save threshold). */
export const CONTINUE_PROGRESS_MIN_SEC = 15;

/** Treat episode as finished when resume is this close to the end (matches player save cutoff). */
export const EPISODE_COMPLETED_RATIO = 0.92;

export type SeriesEpisodeWatchStatus = "unwatched" | "in_progress" | "completed";

export type SeriesEpisodeWatchState = {
  status: SeriesEpisodeWatchStatus;
  resumeSec: number;
  progressPct: number | null;
  durationSec: number;
};

/** Parse runtime from Xtream episode metadata (seconds). */
export function parseEpisodeDurationSec(ep: SeriesEpisode): number {
  const secs = ep.info?.duration_secs;
  if (typeof secs === "number" && Number.isFinite(secs) && secs > 0) {
    return secs;
  }
  const raw = ep.info?.duration;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  if (typeof raw === "string" && raw.trim()) {
    const parts = raw.trim().split(":").map((p) => parseInt(p, 10));
    if (parts.every((n) => Number.isFinite(n))) {
      if (parts.length === 3) {
        return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
      }
      if (parts.length === 2) {
        return parts[0]! * 60 + parts[1]!;
      }
    }
  }
  return 0;
}

export function seriesEpisodeResumeKey(
  accountKey: string,
  seriesId: number,
  ep: SeriesEpisode
): string | null {
  const streamId = parseInt(ep.id, 10);
  if (!Number.isFinite(streamId)) return null;
  return vodResumeStorageKey(accountKey, {
    kind: "series",
    id: seriesId,
    streamId,
    title: "",
    url: "",
  });
}

export function seriesEpisodeWatchState(
  accountKey: string,
  seriesId: number,
  ep: SeriesEpisode,
  vodResumeSec: Record<string, number>
): SeriesEpisodeWatchState {
  const durationSec = parseEpisodeDurationSec(ep);
  const key = seriesEpisodeResumeKey(accountKey, seriesId, ep);
  const resumeSec = key ? (vodResumeSec[key] ?? 0) : 0;

  if (resumeSec < CONTINUE_PROGRESS_MIN_SEC) {
    return {
      status: "unwatched",
      resumeSec: 0,
      progressPct: null,
      durationSec,
    };
  }

  if (
    durationSec > 30 &&
    resumeSec >= durationSec * EPISODE_COMPLETED_RATIO
  ) {
    return {
      status: "completed",
      resumeSec,
      progressPct: 100,
      durationSec,
    };
  }

  return {
    status: "in_progress",
    resumeSec,
    progressPct: computeContinueProgressPct(resumeSec, durationSec),
    durationSec,
  };
}

export type RecentEpisodeMeta = {
  episodeStreamId: number;
  season: string;
  episodeNum: string | number;
  containerExt?: string;
  durationSec?: number;
};

export function parseRecentEpisodeMeta(
  meta: RecentItem["meta"]
): RecentEpisodeMeta | null {
  if (!meta || typeof meta !== "object") return null;
  const episodeStreamId =
    typeof meta.episodeStreamId === "number"
      ? meta.episodeStreamId
      : typeof meta.episodeStreamId === "string"
        ? parsePositiveRouteId(meta.episodeStreamId)
        : null;
  if (episodeStreamId == null || episodeStreamId <= 0) return null;
  const season = meta.season != null ? String(meta.season) : "";
  if (!season) return null;
  const episodeNum = meta.episodeNum ?? meta.episode_num ?? "";
  if (episodeNum === "" || episodeNum == null) return null;
  const containerExt =
    typeof meta.containerExt === "string" ? meta.containerExt : undefined;
  const durationSec =
    typeof meta.durationSec === "number" && Number.isFinite(meta.durationSec)
      ? meta.durationSec
      : undefined;
  return { episodeStreamId, season, episodeNum, containerExt, durationSec };
}

export function recentResumeStorageKey(
  accountKey: string,
  recent: RecentItem
): string | null {
  if (recent.kind === "live") return null;
  if (recent.kind === "movie") {
    return vodResumeStorageKey(accountKey, {
      kind: "movie",
      id: recent.id,
      title: recent.name,
      url: "",
    });
  }
  const ep = parseRecentEpisodeMeta(recent.meta);
  if (!ep) return null;
  return vodResumeStorageKey(accountKey, {
    kind: "series",
    id: recent.id,
    streamId: ep.episodeStreamId,
    title: recent.name,
    url: "",
  });
}

/** Progress 0–95 for UI, or null when nothing to show. */
export function computeContinueProgressPct(
  resumeSec: number | undefined,
  durationSec?: number
): number | null {
  if (resumeSec == null || resumeSec < CONTINUE_PROGRESS_MIN_SEC) return null;
  if (durationSec != null && durationSec > 30) {
    const pct = (resumeSec / durationSec) * 100;
    return Math.min(95, Math.max(4, Math.round(pct)));
  }
  /** No duration — show a visible “in progress” cue (not exact). */
  return 40;
}

export function continueDetailHref(recent: RecentItem): string | undefined {
  if (recent.kind === "movie") return `/app/movies/${recent.id}`;
  if (recent.kind === "series") return `/app/series/${recent.id}`;
  return undefined;
}

export function buildMoviePlayerSourceFromRecent(
  creds: XtreamCredentials,
  recent: RecentItem,
  containerExt = "mp4"
): PlayerSource {
  const ext =
    typeof recent.meta?.containerExt === "string"
      ? recent.meta.containerExt
      : containerExt;
  return {
    kind: "movie",
    id: recent.id,
    title: recent.name,
    poster: recent.icon ? buildImageProxy(recent.icon) : undefined,
    url: buildStreamUrl(creds, "movie", recent.id, ext),
    containerExt: ext,
  };
}

export function buildSeriesPlayerSourceFromRecent(
  creds: XtreamCredentials,
  recent: RecentItem
): PlayerSource | null {
  const epMeta = parseRecentEpisodeMeta(recent.meta);
  if (!epMeta) return null;
  const episode: Pick<
    SeriesEpisode,
    "id" | "direct_source" | "container_extension"
  > = {
    id: String(epMeta.episodeStreamId),
    container_extension: epMeta.containerExt || "mkv",
  };
  const direct =
    typeof recent.meta?.direct_source === "string"
      ? recent.meta.direct_source
      : undefined;
  if (direct) episode.direct_source = direct;
  const playUrl = buildSeriesEpisodePlayUrl(creds, episode);
  const season = epMeta.season;
  const epNum = epMeta.episodeNum;
  return {
    kind: "series",
    id: recent.id,
    streamId: epMeta.episodeStreamId,
    title: recent.name,
    subtitle: `S${season} · E${epNum}`,
    poster: recent.icon ? buildImageProxy(recent.icon) : undefined,
    url: playUrl,
    containerExt: epMeta.containerExt || "mkv",
  };
}

export function buildPlayerSourceFromRecent(
  creds: XtreamCredentials,
  recent: RecentItem
): PlayerSource | null {
  if (recent.kind === "movie") {
    return buildMoviePlayerSourceFromRecent(creds, recent);
  }
  if (recent.kind === "series") {
    return buildSeriesPlayerSourceFromRecent(creds, recent);
  }
  return null;
}

export type SeriesResumeTarget = {
  season: string;
  episode: SeriesEpisode;
  resumeSec: number;
};

/**
 * Pick the latest in-progress episode in play order (not the highest resume offset).
 * Skips episodes that are effectively finished so E2 wins after E1 is done.
 */
export function findSeriesResumeTarget(
  accountKey: string,
  seriesId: number,
  orderedEpisodes: { season: string; ep: SeriesEpisode }[],
  vodResumeSec: Record<string, number>
): SeriesResumeTarget | null {
  let best: SeriesResumeTarget | null = null;
  for (const { season, ep } of orderedEpisodes) {
    const watch = seriesEpisodeWatchState(
      accountKey,
      seriesId,
      ep,
      vodResumeSec
    );
    if (watch.status !== "in_progress") continue;
    best = { season, episode: ep, resumeSec: watch.resumeSec };
  }
  return best;
}

export function seriesEpisodeRecentMeta(
  season: string,
  ep: SeriesEpisode
): Record<string, string | number | undefined> {
  const durationRaw = ep.info?.duration ?? ep.info?.duration_secs;
  const durationSec =
    typeof durationRaw === "number" && Number.isFinite(durationRaw)
      ? durationRaw
      : typeof durationRaw === "string"
        ? parseInt(durationRaw, 10)
        : undefined;
  const streamId = parsePositiveRouteId(ep.id);
  if (streamId == null) {
    return {
      episodeStreamId: 0,
      season,
      episodeNum: ep.episode_num,
      containerExt: ep.container_extension || "mkv",
    };
  }
  return {
    episodeStreamId: streamId,
    season,
    episodeNum: ep.episode_num,
    containerExt: ep.container_extension || "mkv",
    ...(Number.isFinite(durationSec) && (durationSec as number) > 0
      ? { durationSec: durationSec as number }
      : {}),
  };
}
