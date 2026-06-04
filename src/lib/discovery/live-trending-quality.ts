import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import { LIVE_TRENDING_MIN_ITEMS } from "@/lib/discovery/live-trending-on-tv";

const COUNTRY_PREFIX_RE = /^\[?\s*(US|USA|UK|GB|AU|CA|MX|NZ|IE)\s*\]?\s*/i;

/** True when the "programme" line is really just the IPTV channel label. */
export function isChannelOnlyListing(
  programmeTitle: string,
  channelName: string
): boolean {
  const p = programmeTitle.trim();
  const c = channelName.trim();
  if (!p) return true;
  if (p === c) return true;
  if (p.toLowerCase() === c.toLowerCase()) return true;

  const stripCountry = (s: string) => s.replace(COUNTRY_PREFIX_RE, "").trim();
  if (stripCountry(p).toLowerCase() === stripCountry(c).toLowerCase()) {
    return true;
  }

  if (COUNTRY_PREFIX_RE.test(p)) {
    const words = stripCountry(p).split(/\s+/).filter(Boolean);
    const looksLikeShow =
      /\b(season|episode|ep\.|s\d+e\d+|finale|special|pilot)\b/i.test(p) ||
      words.length >= 5;
    if (!looksLikeShow && words.length <= 4) return true;
  }

  return false;
}

export function shouldShowTrendingOnTvShelf(items: ScoredLiveEntry[]): boolean {
  const real = items.filter(
    (e) => !isChannelOnlyListing(e.programmeTitle, e.stream.name)
  );
  return real.length >= LIVE_TRENDING_MIN_ITEMS;
}
