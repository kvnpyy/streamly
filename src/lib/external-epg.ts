/**
 * Server-only fallback EPG sourced from public XMLTV (epg.pw).
 *
 * For channels where the IPTV provider has no schedule data of its own
 * (most channels — see PRE_LAUNCH and the channel-meta parser), we look
 * up a per-country XMLTV file, normalize channel names, and serve back
 * a window of programmes that match.
 *
 * Notes for scale (also documented in PRE_LAUNCH):
 *   - epg.pw country files are big (US ≈ 209 MB). For a single user/local
 *     deployment that's fine; for public hosting we'd want a worker that
 *     pre-fetches popular countries on a schedule and writes a slim
 *     channel-name → programmes JSON to disk/Redis.
 *   - We deliberately avoid any XML parsing dependency: the format is
 *     consistent enough to extract with carefully scoped regexes.
 */

const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
const PAST_WINDOW_S = 2 * 60 * 60; // keep 2h of past
const FUTURE_WINDOW_S = 24 * 60 * 60; // keep 24h of future
const FETCH_TIMEOUT_MS = 90_000; // big files

export type ExternalProgramme = {
  channelId: string;
  start: number; // unix seconds (UTC)
  end: number;
  title: string;
  description?: string;
};

export type CountryIndex = {
  country: string;
  loadedAt: number;
  /** Normalised display name → list of channel ids that share that name. */
  byName: Map<string, string[]>;
  /** Channel id → programmes within the window. */
  programmes: Map<string, ExternalProgramme[]>;
  /** How many programmes we kept (rough scale signal). */
  size: number;
};

const cache = new Map<string, CountryIndex>();
const inflight = new Map<string, Promise<CountryIndex>>();

/**
 * Tokens that, when present as *extras* in a candidate channel name
 * beyond the user's input, should not be treated as a specificity
 * penalty. These are descriptors that often appear in formal channel
 * naming but rarely on the IPTV side ("Fox News" vs "Fox News Channel").
 */
const GENERIC_SUFFIX_TOKENS = new Set([
  "channel",
  "network",
  "tv",
  "the",
  "hq",
  "live",
  "now",
  "plus",
  "pro",
  "international",
  "global",
  "world",
  "studios",
  "official",
]);

/** Normalise a channel name for fuzzy matching against XMLTV display-names.
 *
 * We're conservative on purpose: stripping common words like "TV", "USA",
 * or "the" wrecks more matches than it fixes (e.g. "USA Network" would
 * collapse to just "network"). What we *do* always strip:
 *   - Bracketed/dashed country prefixes ([USA], UK-, etc.) which only
 *     appear on the IPTV side, never in epg.pw display names.
 *   - Quality / encoding tags (HD, FHD, 4K, HEVC) which are format
 *     markers, never part of a real channel identity.
 */
export function normalizeChannelName(input: string): string {
  return (input || "")
    .toLowerCase()
    // strip bracketed prefixes "[USA]", "(US)", "[UK-CHAMP]"
    .replace(/^\s*[\[\(][^\]\)]+[\]\)]\s*/g, " ")
    // strip dashed country prefixes "US -", "EN |", "UK -"
    .replace(/^\s*[a-z]{2,3}\s*[-–|:]\s*/g, " ")
    // strip quality / encoding tags wherever they appear
    .replace(/\b(4k|uhd|fhd|fullhd|hevc|h\.?265|hd\+?|hd|sd)\b/gi, " ")
    // align IPTV short feeds with XMLTV "…ern" spellings (same idea as east/eastern)
    .replace(/\beastern\b/gi, "east")
    .replace(/\bwestern\b/gi, "west")
    .replace(/\bnortheastern\b/gi, "northeast")
    .replace(/\bnorthwestern\b/gi, "northwest")
    .replace(/\bsoutheastern\b/gi, "southeast")
    .replace(/\bsouthwestern\b/gi, "southwest")
    // collapse non-alpha-num
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}

function parseXmltvDate(s: string): number {
  // "20260509000000 +0000"
  const m = s.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{2})(\d{2})?$/
  );
  if (!m) return 0;
  const [, y, mo, d, h, mi, se, tzH = "+00", tzM = "00"] = m;
  const tzMin =
    parseInt(tzH, 10) * 60 + (tzH.startsWith("-") ? -parseInt(tzM, 10) : parseInt(tzM, 10));
  const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
  return Math.floor((utc - tzMin * 60_000) / 1000);
}

/** Given a chunk of epg.pw XMLTV text, build a country index. */
function parseXmltv(text: string, country: string): CountryIndex {
  const channels = new Map<string, string>(); // id → normalised display-name
  const byName = new Map<string, string[]>();
  const programmes = new Map<string, ExternalProgramme[]>();

  // Channels: <channel id="123"><display-name ...>NAME</display-name>...
  const channelRe =
    /<channel\s+id="([^"]+)">\s*<display-name[^>]*>([^<]*)<\/display-name>/g;
  for (let m; (m = channelRe.exec(text)); ) {
    const id = m[1];
    const norm = normalizeChannelName(decodeEntities(m[2]));
    if (!norm) continue;
    channels.set(id, norm);
    const arr = byName.get(norm);
    if (arr) arr.push(id);
    else byName.set(norm, [id]);
  }

  // Programmes: <programme channel="X" start="..." stop="...">...<title>T</title>...
  const now = Math.floor(Date.now() / 1000);
  const cutoff = now - PAST_WINDOW_S;
  const horizon = now + FUTURE_WINDOW_S;
  let kept = 0;
  const programmeRe =
    /<programme\s+channel="([^"]+)"\s+start="([^"]+)"\s+stop="([^"]+)"[^>]*>([\s\S]*?)<\/programme>/g;
  for (let m; (m = programmeRe.exec(text)); ) {
    const start = parseXmltvDate(m[2]);
    const end = parseXmltvDate(m[3]);
    if (!start || !end || end < cutoff || start > horizon) continue;
    const channelId = m[1];
    if (!channels.has(channelId)) continue; // unknown channel — skip
    const inner = m[4];
    const tMatch = inner.match(/<title[^>]*>([\s\S]*?)<\/title>/);
    if (!tMatch) continue;
    const title = decodeEntities(tMatch[1]).trim();
    if (!title) continue;
    const dMatch = inner.match(/<desc[^>]*>([\s\S]*?)<\/desc>/);
    const description = dMatch ? decodeEntities(dMatch[1]).trim() : undefined;
    const list = programmes.get(channelId);
    const programme: ExternalProgramme = {
      channelId,
      start,
      end,
      title,
      description,
    };
    if (list) list.push(programme);
    else programmes.set(channelId, [programme]);
    kept++;
  }

  // Sort each channel's programmes by start time (small-N per channel).
  for (const list of programmes.values()) {
    list.sort((a, b) => a.start - b.start);
  }

  return {
    country,
    loadedAt: Date.now(),
    byName,
    programmes,
    size: kept,
  };
}

async function downloadCountry(country: string): Promise<CountryIndex> {
  const cc = country.toUpperCase();
  const url = `https://epg.pw/xmltv/epg_${cc}.xml`;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { "User-Agent": "iptv-stream/1.0 (+self-hosted)" },
    });
    if (!res.ok) {
      throw new Error(`epg.pw returned ${res.status} for ${cc}`);
    }
    const text = await res.text();
    return parseXmltv(text, cc);
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Returns the cached country index, kicking off a background fetch on first
 * use. Concurrent callers for the same country share a single in-flight
 * request.
 */
export async function getCountryIndex(
  country: string
): Promise<CountryIndex | null> {
  const cc = (country || "").toUpperCase().trim();
  if (!cc) return null;
  // Only allow letters/digits to keep this from being abused as an SSRF vector.
  if (!/^[A-Z]{2,3}$/.test(cc)) return null;

  const hit = cache.get(cc);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) return hit;

  const existing = inflight.get(cc);
  if (existing) return existing;

  const promise = downloadCountry(cc)
    .then((index) => {
      cache.set(cc, index);
      return index;
    })
    .finally(() => {
      inflight.delete(cc);
    });
  inflight.set(cc, promise);

  // If we have a stale cache entry, return it immediately and refresh in
  // background. Otherwise, await the first load.
  if (hit) return hit;
  return promise.catch(() => null);
}

export type LookupResult = {
  programmes: ExternalProgramme[];
  matchedName: string | null;
  source: "iptv-org-epg-pw";
};

/** Exact-map variants (e.g. A&E → `a e` vs `ae` after normalisation). */
/** Whole-word token match so `fox` doesn’t hit inside unrelated tokens. */
function tokenPresentAsWord(candidate: string, token: string): boolean {
  if (token.length < 2) return false;
  const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(candidate);
}

function collectNormVariants(norm: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.trim();
    if (!t || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  add(norm);
  const collapsed = norm.replace(/\b([a-z])\s+([a-z])\b/g, "$1$2");
  add(collapsed);
  return out;
}

/**
 * Regional / feed tokens often appear on IPTV lines ("BET EAST", "BOUNCE XL") but
 * not on iptv-org display-names. Try progressively stripped names until we get
 * programmes in-window (see lookupChannel).
 */
const FEED_LOOKUP_VARIANT_RE =
  /\b(east|west|north|south|northeast|northwest|southeast|southwest|national|local|main|feed|xl|extra|prime|dt|cable|sat|sub|alternate|alt)\b/gi;

function externalLookupNameVariants(norm: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (s: string) => {
    const t = s.replace(/\s+/g, " ").trim();
    if (t.length < 2 || seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  add(norm);
  // XMLTV often uses "Eastern/Western"; IPTV lines use "East/West".
  add(norm.replace(/\beast\b/gi, "eastern").replace(/\s+/g, " ").trim());
  add(norm.replace(/\bwest\b/gi, "western").replace(/\s+/g, " ").trim());
  add(norm.replace(/\bnortheast\b/gi, "northeastern").replace(/\s+/g, " ").trim());
  add(norm.replace(/\bnorthwest\b/gi, "northwestern").replace(/\s+/g, " ").trim());
  add(norm.replace(/\bsoutheast\b/gi, "southeastern").replace(/\s+/g, " ").trim());
  add(norm.replace(/\bsouthwest\b/gi, "southwestern").replace(/\s+/g, " ").trim());
  add(norm.replace(FEED_LOOKUP_VARIANT_RE, " ").replace(/\s+/g, " ").trim());
  add(
    norm
      .replace(FEED_LOOKUP_VARIANT_RE, " ")
      .replace(/\b(tv|channel|network)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
  return out;
}

function gatherProgrammesForIds(
  index: CountryIndex,
  matchedIds: string[],
  fromUnix: number,
  toUnix: number,
  limit: number
): ExternalProgramme[] {
  const seen = new Set<string>();
  const out: ExternalProgramme[] = [];
  for (const id of matchedIds) {
    const list = index.programmes.get(id) ?? [];
    for (const p of list) {
      if (p.end < fromUnix || p.start > toUnix) continue;
      const k = `${p.start}|${p.title}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(p);
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out.slice(0, limit);
}

function resolveChannelIdsForNorm(
  index: CountryIndex,
  norm: string
): { matchedIds: string[]; matchedName: string | null } {
  let matchedIds: string[] = [];
  let matchedName: string | null = null;

  for (const v of collectNormVariants(norm)) {
    matchedIds = index.byName.get(v) ?? [];
    if (matchedIds.length) {
      matchedName = v;
      break;
    }
  }

  if (matchedIds.length === 0) {
    const inputTokens = norm.split(" ").filter((t) => t.length > 1);
    if (inputTokens.length > 0) {
      const inputSet = new Set(inputTokens);
      const headToken = inputTokens[0];
      const allowMissing = inputTokens.length >= 4 ? 1 : 0;
      let best:
        | { name: string; score: number; len: number }
        | null = null;
      for (const candidate of index.byName.keys()) {
        if (candidate.length < 2) continue;
        const cTokens = candidate.split(" ");
        const cSet = new Set(cTokens);
        if (!cSet.has(headToken)) continue;
        let overlap = 0;
        for (const t of inputTokens) if (cSet.has(t)) overlap++;
        const missing = inputTokens.length - overlap;
        if (missing > allowMissing) continue;
        let specificExtras = 0;
        let genericExtras = 0;
        for (const ct of cTokens) {
          if (inputSet.has(ct)) continue;
          if (GENERIC_SUFFIX_TOKENS.has(ct)) genericExtras++;
          else specificExtras++;
        }
        const score =
          overlap * 3 - specificExtras * 2 - genericExtras - missing * 2;
        if (score <= 0) continue;
        if (
          !best ||
          score > best.score ||
          (score === best.score && candidate.length < best.len)
        ) {
          best = { name: candidate, score, len: candidate.length };
        }
      }
      if (best) {
        matchedIds = index.byName.get(best.name) ?? [];
        matchedName = best.name;
      }
    }
  }

  if (matchedIds.length === 0 && norm.length >= 3) {
    let best: { name: string; score: number } | null = null;
    for (const candidate of index.byName.keys()) {
      const matches =
        norm.length >= 5
          ? candidate.includes(norm)
          : tokenPresentAsWord(candidate, norm);
      if (!matches) continue;
      const score = 500 - candidate.length;
      if (!best || score > best.score) {
        best = { name: candidate, score };
      }
    }
    if (best) {
      matchedIds = index.byName.get(best.name) ?? [];
      matchedName = best.name;
    }
  }

  if (matchedIds.length === 0 && norm.length >= 4) {
    const tokens = norm.split(" ").filter((t) => t.length >= 2);
    if (tokens.length >= 2) {
      let best: { name: string; score: number; len: number } | null = null;
      for (const candidate of index.byName.keys()) {
        if (!tokens.every((t) => tokenPresentAsWord(candidate, t))) continue;
        const score =
          tokens.reduce((acc, t) => acc + t.length, 0) * 12 -
          candidate.length;
        if (
          !best ||
          score > best.score ||
          (score === best.score && candidate.length < best.len)
        ) {
          best = { name: candidate, score, len: candidate.length };
        }
      }
      if (best) {
        matchedIds = index.byName.get(best.name) ?? [];
        matchedName = best.name;
      }
    }
  }

  return { matchedIds, matchedName };
}

/**
 * Find programmes for a channel name within a time window.
 * Tries (in order):
 *   1. Exact normalised match (+ letter-collapsed variant)
 *   2. Token-overlap scorer (needs tokens length ≥2)
 *   3. Substring / whole-word: XMLTV display-name matches normalized iptv name
 *      (substring if norm length ≥5, else whole-word so short networks like ABC resolve)
 *
 * Then repeats with stripped regional/feed tokens ("bet east" → "bet") until
 * programmes exist in the requested window.
 */
export function lookupChannel(
  index: CountryIndex,
  rawName: string,
  fromUnix: number,
  toUnix: number,
  limit = 8
): LookupResult {
  const empty: LookupResult = {
    programmes: [],
    matchedName: null,
    source: "iptv-org-epg-pw",
  };
  const norm0 = normalizeChannelName(rawName);
  if (!norm0) return empty;

  let idleMatch: LookupResult | null = null;

  for (const nameNorm of externalLookupNameVariants(norm0)) {
    const { matchedIds, matchedName } = resolveChannelIdsForNorm(
      index,
      nameNorm
    );
    if (!matchedIds.length) continue;

    const programmes = gatherProgrammesForIds(
      index,
      matchedIds,
      fromUnix,
      toUnix,
      limit
    );
    if (programmes.length > 0) {
      return {
        programmes,
        matchedName,
        source: "iptv-org-epg-pw",
      };
    }
    if (!idleMatch && matchedName) {
      idleMatch = {
        programmes: [],
        matchedName,
        source: "iptv-org-epg-pw",
      };
    }
  }

  return idleMatch ?? empty;
}
