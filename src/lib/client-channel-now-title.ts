import { inferCountryFromCategory, parseChannelMeta } from "@/lib/channel-meta";
import { SHORT_EPG_NOW_PLAYING_LIMIT } from "@/lib/epg-constants";
import { nowPlayingTitleFromListings } from "@/lib/epg-text";
import { type EpgListingLike, epgListingsHaveParsableTimes } from "@/lib/epg-time";
import { xtream } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";

async function externalNowTitle(
  channelName: string,
  country: string,
  signal?: AbortSignal
): Promise<string | undefined> {
  const params = new URLSearchParams({
    name: channelName,
    country,
    limit: "6",
  });
  const res = await fetch(`/api/external-epg?${params.toString()}`, {
    signal,
    cache: "no-store",
  });
  if (!res.ok) return undefined;
  const data = (await res.json()) as {
    epg_listings?: Array<{ title?: string; now_playing?: number }>;
  };
  const listings = (data?.epg_listings ?? []) as EpgListingLike[];
  if (!listings.length) return undefined;
  const nowSec = Math.floor(Date.now() / 1000);
  return nowPlayingTitleFromListings(listings, nowSec);
}

/** Provider short EPG, then iptv-org fallback — for shelf tiles and search. */
export async function fetchClientChannelNowTitle(
  creds: XtreamCredentials,
  streamId: number,
  channelName: string,
  categoryLine?: string,
  signal?: AbortSignal
): Promise<string | undefined> {
  try {
    const data = await xtream.shortEPG(
      creds,
      streamId,
      SHORT_EPG_NOW_PLAYING_LIMIT,
      signal
    );
    const listings = data?.epg_listings ?? [];
    if (listings.length && epgListingsHaveParsableTimes(listings)) {
      const title = nowPlayingTitleFromListings(
        listings,
        Math.floor(Date.now() / 1000)
      );
      if (title?.trim()) return title.trim();
    }
  } catch {
    /* try external */
  }

  const country =
    inferCountryFromCategory(categoryLine || "") ||
    parseChannelMeta(channelName).countryCode;
  if (!country) return undefined;
  return externalNowTitle(channelName, country, signal);
}
