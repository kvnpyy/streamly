import "server-only";

import { inferCountryFromCategory, parseChannelMeta } from "@/lib/channel-meta";
import { snapshotFromListings } from "@/lib/discovery/live-epg";
import { SHORT_EPG_NOW_PLAYING_LIMIT } from "@/lib/epg-constants";
import { decodeEpgText, nowPlayingTitleFromListings } from "@/lib/epg-text";
import { epgListingsHaveParsableTimes } from "@/lib/epg-time";
import { getCountryIndex, lookupChannel } from "@/lib/external-epg";
import {
  getServerEpgTitle,
  hydrateServerEpgCache,
  setServerEpgTitle,
} from "@/lib/epg-server-title-cache";
import { extractXtreamEpgPayload } from "@/lib/xtream";
import { fetchXtreamUpstreamJson } from "@/lib/xtream-server-upstream";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";

async function fetchExternalNowTitle(
  channelName: string,
  country: string
): Promise<string | undefined> {
  let index;
  try {
    index = await getCountryIndex(country);
  } catch {
    return undefined;
  }
  if (!index) return undefined;

  const now = Math.floor(Date.now() / 1000);
  const result = lookupChannel(
    index,
    channelName,
    now - 60 * 60,
    now + 6 * 60 * 60,
    8
  );
  if (!result.programmes.length) return undefined;

  const listings = result.programmes.map((p, i) => ({
    id: `ext-${p.channelId}-${i}`,
    title: p.title,
    start_timestamp: String(p.start),
    stop_timestamp: String(p.end),
    now_playing: p.start <= now && now < p.end ? 1 : 0,
  }));

  const title = nowPlayingTitleFromListings(listings, now);
  return title ? decodeEpgText(title).trim() : undefined;
}

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
    if (listings?.length && epgListingsHaveParsableTimes(listings)) {
      const snap = snapshotFromListings(
        listings,
        Math.floor(Date.now() / 1000)
      );
      const title = snap?.nowTitle?.trim();
      if (title) {
        setServerEpgTitle(creds, streamId, title);
        return title;
      }
    }
  } catch {
    /* try external */
  }

  return undefined;
}

/** Provider short EPG, then iptv-org — used for Trending on TV server scan. */
export async function fetchNowPlayingTitleForChannel(
  creds: XtreamCredentials,
  channel: LiveStream,
  categoryName?: string
): Promise<string | undefined> {
  const fromProvider = await fetchNowPlayingTitle(creds, channel.stream_id);
  if (fromProvider) return fromProvider;

  const country =
    inferCountryFromCategory(categoryName || "") ||
    parseChannelMeta(channel.name).countryCode;
  if (!country) return undefined;

  const fromExternal = await fetchExternalNowTitle(channel.name, country);
  if (fromExternal) {
    setServerEpgTitle(creds, channel.stream_id, fromExternal);
  }
  return fromExternal;
}
