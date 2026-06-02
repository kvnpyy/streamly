import {
  stubLiveStreamFromFavorite,
  stubLiveStreamFromRecent,
} from "@/lib/live-flip-playlist";
import type { LiveStream } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";

/**
 * Lightweight live channel list for the home/library page — recents + favorites
 * only. Avoids loading tens of thousands of streams just to render shelves.
 */
export function buildHomeLiveChannelList(
  recents: RecentItem[],
  favorites: Favorite[]
): LiveStream[] {
  const out: LiveStream[] = [];
  const seen = new Set<number>();

  const push = (stream: LiveStream) => {
    if (seen.has(stream.stream_id)) return;
    seen.add(stream.stream_id);
    out.push(stream);
  };

  for (const r of recents) {
    if (r.kind !== "live") continue;
    push(stubLiveStreamFromRecent(r));
  }
  for (const f of favorites) {
    if (f.kind !== "live") continue;
    push(stubLiveStreamFromFavorite(f));
  }

  return out;
}
