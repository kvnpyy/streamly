import "server-only";

import { snapshotFromListings } from "@/lib/discovery/live-epg";
import { SHORT_EPG_NOW_PLAYING_LIMIT } from "@/lib/epg-constants";
import {
  getServerEpgTitle,
  hydrateServerEpgCache,
  setServerEpgTitle,
} from "@/lib/epg-server-title-cache";
import { extractXtreamEpgPayload } from "@/lib/xtream";
import { fetchXtreamUpstreamJson } from "@/lib/xtream-server-upstream";
import type { XtreamCredentials } from "@/lib/xtream-types";

export async function fetchNowPlayingTitle(
  creds: XtreamCredentials,
  streamId: number,
  limit = SHORT_EPG_NOW_PLAYING_LIMIT
): Promise<string | undefined> {
  await hydrateServerEpgCache(creds);

  const cached = getServerEpgTitle(creds, streamId);
  if (cached) return cached;

  try {
    const raw = await fetchXtreamUpstreamJson(creds, {
      action: "get_short_epg",
      stream_id: String(streamId),
      limit: String(limit),
    });
    const payload = extractXtreamEpgPayload(raw);
    const listings = payload?.epg_listings;
    const snap = listings?.length
      ? snapshotFromListings(listings, Math.floor(Date.now() / 1000))
      : null;
    const title = snap?.nowTitle?.trim();
    if (title) setServerEpgTitle(creds, streamId, title);
    return title;
  } catch {
    return undefined;
  }
}
