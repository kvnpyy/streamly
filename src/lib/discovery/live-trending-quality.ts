import { parseChannelMeta } from "@/lib/channel-meta";
import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import { normalizeDiscoveryTitle } from "@/lib/discovery/normalize-title";
import { programmeLooksLikeSports } from "@/lib/discovery/sports-keywords";
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

/** One row per on-air title; avoid six HBO feeds for different movies. */
export function programmeTrendingKey(programmeTitle: string): string {
  let key = normalizeDiscoveryTitle(programmeTitle);
  key = key.replace(/\b(season|s\d{1,2}e\d{1,2}|episode|ep)\b.*$/i, "").trim();
  const words = key.split(/\s+/).filter(Boolean);
  return words.slice(0, 5).join(" ");
}

export function networkTrendingKey(channelName: string): string {
  const meta = parseChannelMeta(channelName);
  if (meta.network) return meta.network.toUpperCase();
  const upper = channelName.toUpperCase();
  const known = [
    "HBO",
    "ESPN",
    "TSN",
    "CNN",
    "ABC",
    "NBC",
    "CBS",
    "FOX",
    "TNT",
    "TBS",
    "AMC",
    "FX",
    "USA",
    "CW",
    "PBS",
    "NFL",
    "NBA",
    "MLB",
    "NHL",
  ];
  for (const net of known) {
    if (upper.includes(net)) return net;
  }
  return normalizeDiscoveryTitle(channelName).slice(0, 20);
}

/**
 * Cap shelf size and spread picks across networks (max 1 entertainment feed
 * per network; up to 2 sports on the same network e.g. ESPN).
 */
export function diversifyTrendingOnTvEntries(
  sorted: ScoredLiveEntry[],
  limit: number
): ScoredLiveEntry[] {
  const seenProgramme = new Set<string>();
  const networkCounts = new Map<string, number>();
  const out: ScoredLiveEntry[] = [];

  for (const entry of sorted) {
    const progKey = programmeTrendingKey(entry.programmeTitle);
    if (!progKey || seenProgramme.has(progKey)) continue;

    const net = networkTrendingKey(entry.stream.name);
    const sports = programmeLooksLikeSports(entry.programmeTitle);
    const netUsed = networkCounts.get(net) ?? 0;
    const netCap = sports ? 2 : 1;
    if (netUsed >= netCap) continue;

    seenProgramme.add(progKey);
    networkCounts.set(net, netUsed + 1);
    out.push(entry);
    if (out.length >= limit) break;
  }

  return out;
}
