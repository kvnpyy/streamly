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

/** Pick the in-progress episode with the furthest resume position. */
export function findSeriesResumeTarget(
  accountKey: string,
  seriesId: number,
  orderedEpisodes: { season: string; ep: SeriesEpisode }[],
  vodResumeSec: Record<string, number>
): SeriesResumeTarget | null {
  let best: SeriesResumeTarget | null = null;
  for (const { season, ep } of orderedEpisodes) {
    const streamId = parseInt(ep.id, 10);
    if (!Number.isFinite(streamId)) continue;
    const key = vodResumeStorageKey(accountKey, {
      kind: "series",
      id: seriesId,
      streamId,
      title: "",
      url: "",
    });
    if (!key) continue;
    const resumeSec = vodResumeSec[key];
    if (resumeSec == null || resumeSec < CONTINUE_PROGRESS_MIN_SEC) continue;
    if (!best || resumeSec > best.resumeSec) {
      best = { season, episode: ep, resumeSec };
    }
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
