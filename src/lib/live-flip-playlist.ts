import { buildLivePlayUrl } from "@/lib/xtream";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import type { PlayerPlaylist, PlayerSource } from "@/store/player";

/** Minimal `LiveStream` for flip playlists from favorites / recents. */
export function stubLiveStreamFromFavorite(f: Favorite): LiveStream {
  return {
    num: 0,
    name: f.name,
    stream_type: "live",
    stream_id: f.id,
    stream_icon: f.icon ?? "",
    added: "",
    category_id: "0",
    tv_archive: 0,
    ...(typeof f.meta?.direct_source === "string"
      ? { direct_source: f.meta.direct_source }
      : {}),
  };
}

export function stubLiveStreamFromRecent(r: RecentItem): LiveStream {
  return {
    num: 0,
    name: r.name,
    stream_type: "live",
    stream_id: r.id,
    stream_icon: r.icon ?? "",
    added: "",
    category_id: "0",
    tv_archive: 0,
    ...(typeof r.meta?.direct_source === "string"
      ? { direct_source: r.meta.direct_source }
      : {}),
  };
}

export function liveStreamToPlayerSource(
  creds: XtreamCredentials,
  stream: LiveStream
): PlayerSource {
  return {
    kind: "live",
    id: stream.stream_id,
    title: stream.name,
    poster: stream.stream_icon,
    url: buildLivePlayUrl(creds, stream),
  };
}

/** Put the playing channel first so ↑/↓ stay inside the same category. */
export function orderLiveStreamsForFlip(
  streams: LiveStream[],
  streamId: number
): LiveStream[] {
  if (streams.length <= 1) return streams;
  const idx = streams.findIndex((s) => s.stream_id === streamId);
  if (idx <= 0) return streams;
  return [...streams.slice(idx), ...streams.slice(0, idx)];
}

/** Playlist for ↑/↓ and player channel buttons (capped for large providers). */
export function buildLiveFlipPlaylist(
  creds: XtreamCredentials,
  streams: LiveStream[],
  maxItems = 600
): PlayerPlaylist {
  return {
    kind: "live",
    items: streams
      .slice(0, maxItems)
      .map((s) => liveStreamToPlayerSource(creds, s)),
  };
}

/** Max channels in a category flip list (player ↑/↓ while browsing shelves). */
export const LIVE_CATEGORY_FLIP_LIMIT = 48;
