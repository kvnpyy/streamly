import {
  buildLiveFlipPlaylist,
  orderLiveStreamsForFlip,
  stubLiveStreamFromRecent,
} from "@/lib/live-flip-playlist";
import type { LiveStream } from "@/lib/xtream-types";
import type { RecentItem } from "@/store/preferences";

export type LiveRecentEntry = {
  recent: RecentItem;
  stream: LiveStream;
};

/**
 * Continue-watching rows for Live TV — always materialize from recents first,
 * optionally enriched by catalog lookup. Never drop a recent when the API
 * omits an id (stale index, panel glitch, or fetch race).
 */
export function buildLiveRecentStreams(
  recents: RecentItem[],
  fetchedStreams: LiveStream[] | undefined,
  limit = 12
): LiveRecentEntry[] {
  const byId = new Map(
    (fetchedStreams ?? []).map((s) => [s.stream_id, s] as const)
  );
  return recents
    .filter((r) => r.kind === "live")
    .slice(0, limit)
    .map((recent) => ({
      recent,
      stream: byId.get(recent.id) ?? stubLiveStreamFromRecent(recent),
    }));
}

/** Flip list for a continue-watching tap — prefer the visible grid, else recents. */
export function liveRecentFlipStreams(
  stream: LiveStream,
  catalogStreams: LiveStream[] | undefined,
  recents: RecentItem[],
  limit = 48
): LiveStream[] {
  const catalog = catalogStreams?.filter(Boolean) ?? [];
  const recentStubs = recents
    .filter((r) => r.kind === "live")
    .map(stubLiveStreamFromRecent);
  const base =
    catalog.length > 0
      ? catalog
      : recentStubs.length > 0
        ? recentStubs
        : [stream];
  const ordered = orderLiveStreamsForFlip(base, stream.stream_id);
  if (!ordered.some((s) => s.stream_id === stream.stream_id)) {
    return orderLiveStreamsForFlip([stream, ...ordered], stream.stream_id).slice(
      0,
      limit
    );
  }
  return ordered.slice(0, limit);
}

export function liveRecentFlipPlaylist(
  creds: import("@/lib/xtream-types").XtreamCredentials,
  stream: LiveStream,
  catalogStreams: LiveStream[] | undefined,
  recents: RecentItem[],
  limit = 48
) {
  return buildLiveFlipPlaylist(
    creds,
    liveRecentFlipStreams(stream, catalogStreams, recents, limit)
  );
}
