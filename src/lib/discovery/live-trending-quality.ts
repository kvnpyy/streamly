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

/** Reruns / library slots — not “what people are watching right now”. */
const STALE_RERUN_PATTERNS: RegExp[] = [
  /\bclassic\s+games?\b/i,
  /\b(?:nfl|nba|mlb|nhl)\s+classics?\b/i,
  /\breplay\b/i,
  /\bencore\b/i,
  /\brerun\b/i,
  /\bre-?air\b/i,
  /\bthrowback\b/i,
  /\bgreatest\s+(?:hits|games?|moments)\b/i,
  /\bmarathon:\s*.+\b(19|20)\d{2}\b/i,
];

export function programmeLooksLikeStaleRerun(title: string): boolean {
  const t = title.trim();
  if (!t) return false;
  return STALE_RERUN_PATTERNS.some((re) => re.test(t));
}

export function shouldShowTrendingOnTvShelf(items: ScoredLiveEntry[]): boolean {
  const real = items.filter(
    (e) =>
      !isChannelOnlyListing(e.programmeTitle, e.stream.name) &&
      !programmeLooksLikeStaleRerun(e.programmeTitle)
  );
  return real.length >= LIVE_TRENDING_MIN_ITEMS;
}
