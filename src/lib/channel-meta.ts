/**
 * Parse a noisy IPTV channel name into structured metadata. Used as a
 * graceful fallback for channels that have no EPG: instead of showing a
 * blank line, we surface country, network, topic, location, etc. derived
 * from the channel name itself.
 *
 * Designed to be safe — every field is optional, and we never invent
 * information; when the parser isn't confident, it leaves the field unset.
 */

export type ChannelMeta = {
  /** Country flag emoji (e.g. "🇺🇸"). */
  flag?: string;
  /** Human-readable country (e.g. "United States"). */
  country?: string;
  /** ISO 3166-1 alpha-2 country code (e.g. "US", "GB"). Used by the
   *  external EPG fallback to pick the right country file. */
  countryCode?: string;
  /** Detected broadcast network or producer (e.g. "ABC", "BBC", "ESPN"). */
  network?: string;
  /** Detected top-level topic (e.g. "Sports", "News", "Movies"). */
  topic?: string;
  /** Emoji that goes with the topic, if any. */
  topicEmoji?: string;
  /** Quality tag (HD, FHD, 4K, etc.). */
  quality?: string;
  /** Specific detail like a city, sub-league, or event. */
  detail?: string;
  /** True if we found nothing useful. */
  isEmpty?: boolean;
};

const COUNTRY_TABLE: Array<{
  codes: string[];
  flag: string;
  name: string;
  /** ISO-2 code used to look up the right epg.pw country file. */
  iso2?: string;
}> = [
  { codes: ["USA", "US", "UNITED STATES"], flag: "🇺🇸", name: "United States", iso2: "US" },
  { codes: ["UK", "GB", "ENGLAND", "BRITAIN"], flag: "🇬🇧", name: "United Kingdom", iso2: "GB" },
  { codes: ["CA", "CAN", "CANADA"], flag: "🇨🇦", name: "Canada", iso2: "CA" },
  { codes: ["AU", "AUS", "AUSTRALIA"], flag: "🇦🇺", name: "Australia", iso2: "AU" },
  { codes: ["DE", "GER", "GERMANY"], flag: "🇩🇪", name: "Germany", iso2: "DE" },
  { codes: ["FR", "FRA", "FRANCE"], flag: "🇫🇷", name: "France", iso2: "FR" },
  { codes: ["ES", "ESP", "SPAIN"], flag: "🇪🇸", name: "Spain", iso2: "ES" },
  { codes: ["IT", "ITA", "ITALY"], flag: "🇮🇹", name: "Italy", iso2: "IT" },
  { codes: ["PT", "POR", "PORTUGAL"], flag: "🇵🇹", name: "Portugal", iso2: "PT" },
  { codes: ["BR", "BRA", "BRAZIL"], flag: "🇧🇷", name: "Brazil", iso2: "BR" },
  { codes: ["MX", "MEX", "MEXICO"], flag: "🇲🇽", name: "Mexico", iso2: "MX" },
  { codes: ["AR", "ARG", "ARGENTINA"], flag: "🇦🇷", name: "Argentina", iso2: "AR" },
  { codes: ["IN", "IND", "INDIA"], flag: "🇮🇳", name: "India", iso2: "IN" },
  { codes: ["PK", "PAK", "PAKISTAN"], flag: "🇵🇰", name: "Pakistan", iso2: "PK" },
  { codes: ["BD", "BAN", "BANGLADESH"], flag: "🇧🇩", name: "Bangladesh", iso2: "BD" },
  { codes: ["NL", "NED", "NETHERLANDS"], flag: "🇳🇱", name: "Netherlands", iso2: "NL" },
  { codes: ["BE", "BEL", "BELGIUM"], flag: "🇧🇪", name: "Belgium", iso2: "BE" },
  { codes: ["AT", "AUT", "AUSTRIA"], flag: "🇦🇹", name: "Austria", iso2: "AT" },
  { codes: ["CH", "SUI", "SWITZERLAND"], flag: "🇨🇭", name: "Switzerland", iso2: "CH" },
  { codes: ["IE", "IRL", "IRELAND"], flag: "🇮🇪", name: "Ireland", iso2: "IE" },
  { codes: ["JP", "JPN", "JAPAN"], flag: "🇯🇵", name: "Japan", iso2: "JP" },
  { codes: ["KR", "KOR", "KOREA"], flag: "🇰🇷", name: "Korea", iso2: "KR" },
  { codes: ["CN", "CHN", "CHINA"], flag: "🇨🇳", name: "China", iso2: "CN" },
  { codes: ["HK", "HONG KONG"], flag: "🇭🇰", name: "Hong Kong", iso2: "HK" },
  { codes: ["TW", "TAIWAN"], flag: "🇹🇼", name: "Taiwan", iso2: "TW" },
  { codes: ["TR", "TUR", "TURKEY"], flag: "🇹🇷", name: "Türkiye", iso2: "TR" },
  { codes: ["RU", "RUS", "RUSSIA"], flag: "🇷🇺", name: "Russia", iso2: "RU" },
  { codes: ["UA", "UKR", "UKRAINE"], flag: "🇺🇦", name: "Ukraine", iso2: "UA" },
  { codes: ["PL", "POL", "POLAND"], flag: "🇵🇱", name: "Poland", iso2: "PL" },
  { codes: ["RO", "ROM", "ROMANIA"], flag: "🇷🇴", name: "Romania", iso2: "RO" },
  { codes: ["GR", "GRE", "GREECE"], flag: "🇬🇷", name: "Greece", iso2: "GR" },
  { codes: ["AE", "UAE", "EMIRATES"], flag: "🇦🇪", name: "UAE", iso2: "AE" },
  { codes: ["SA", "KSA", "SAUDI"], flag: "🇸🇦", name: "Saudi Arabia", iso2: "SA" },
  { codes: ["EG", "EGY", "EGYPT"], flag: "🇪🇬", name: "Egypt", iso2: "EG" },
  { codes: ["MA", "MAR", "MOROCCO"], flag: "🇲🇦", name: "Morocco", iso2: "MA" },
  { codes: ["ZA", "RSA", "SOUTH AFRICA"], flag: "🇿🇦", name: "South Africa", iso2: "ZA" },
  { codes: ["NG", "NIG", "NIGERIA"], flag: "🇳🇬", name: "Nigeria", iso2: "NG" },
  // "EN" channels almost always carry UK or US schedule; default to GB.
  { codes: ["EN", "ENG"], flag: "🇬🇧", name: "English", iso2: "GB" },
  // Pan-regional buckets (no useful ISO match for the EPG fallback).
  { codes: ["AR-MID", "ARABIC", "ARAB"], flag: "🌍", name: "Arabic" },
  { codes: ["LATIN", "LAT", "LATAM"], flag: "🌎", name: "Latin America" },
];

const COUNTRY_LOOKUP: Record<
  string,
  { flag: string; name: string; iso2?: string }
> = COUNTRY_TABLE.reduce(
  (acc, row) => {
    for (const code of row.codes) {
      acc[code] = { flag: row.flag, name: row.name, iso2: row.iso2 };
    }
    return acc;
  },
  {} as Record<string, { flag: string; name: string; iso2?: string }>
);

type TopicMatcher = {
  topic: string;
  emoji: string;
  /** Word patterns that, when present in the channel name, classify it. */
  patterns: RegExp[];
};

const TOPICS: TopicMatcher[] = [
  {
    topic: "News",
    emoji: "📰",
    patterns: [/\bnews\b/i, /\bcnn\b/i, /\bbbc news\b/i, /\bfox news\b/i, /\bmsnbc\b/i, /\bnewsmax\b/i, /\bal\s?jazeera\b/i, /\beuronews\b/i, /\bsky news\b/i],
  },
  {
    topic: "Sports",
    emoji: "🏆",
    patterns: [
      /\bsports?\b/i,
      /\bespn\b/i,
      /\bfox sports?\b/i,
      /\bsky sports?\b/i,
      /\btsn\b/i,
      /\bbein\b/i,
      /\bnba\b/i,
      /\bnfl\b/i,
      /\bmlb\b/i,
      /\bnhl\b/i,
      /\bncaa\b/i,
      /\bmls\b/i,
      /\bepl\b/i,
      /\bla liga\b/i,
      /\bserie a\b/i,
      /\bbundesliga\b/i,
      /\bligue 1\b/i,
      /\bufc\b/i,
      /\bbox(ing)?\b/i,
      /\bchamp(ions?)?\b/i,
      /\bf1\b/i,
      /\bformula 1\b/i,
      /\bgolf\b/i,
      /\btennis\b/i,
      /\bcricket\b/i,
      /\brugby\b/i,
      /\blacrosse\b/i,
      /\bwrestling\b/i,
      /\bsoccer\b/i,
      /\bbasketball\b/i,
      /\bbaseball\b/i,
      /\bhockey\b/i,
      /\bfootball\b/i,
      /\bflo[a-z]+\b/i,
    ],
  },
  {
    topic: "Movies",
    emoji: "🎬",
    patterns: [
      /\bmovies?\b/i,
      /\bcinema\b/i,
      /\bhbo\b/i,
      /\bshowtime\b/i,
      /\bstarz\b/i,
      /\bcinemax\b/i,
      /\bsundance\b/i,
      /\btmc\b/i,
      /\bamc\b/i,
    ],
  },
  {
    topic: "Kids",
    emoji: "🧸",
    patterns: [
      /\bkids?\b/i,
      /\bcartoon\b/i,
      /\bdisney\b/i,
      /\bnickelodeon\b/i,
      /\bnick jr\b/i,
      /\bnicktoons\b/i,
      /\bbaby\b/i,
      /\btoonami\b/i,
      /\bpbs kids\b/i,
    ],
  },
  {
    topic: "Music",
    emoji: "🎵",
    patterns: [/\bmusic\b/i, /\bmtv\b/i, /\bvevo\b/i, /\bcountry music\b/i, /\bvh1\b/i],
  },
  {
    topic: "Documentary",
    emoji: "🌍",
    patterns: [/\bdocu(?:mentary)?\b/i, /\bnat ?geo\b/i, /\bnational geographic\b/i, /\bdiscovery\b/i, /\bhistory\b/i, /\banimal planet\b/i, /\bsmithsonian\b/i],
  },
  {
    topic: "Lifestyle",
    emoji: "🏡",
    patterns: [/\bcooking\b/i, /\bfood network\b/i, /\bhgtv\b/i, /\bdiy\b/i, /\btravel\b/i, /\bfashion\b/i],
  },
  {
    topic: "Holiday",
    emoji: "🎄",
    patterns: [/\bchristmas\b/i, /\bholiday\b/i, /\bhalloween\b/i],
  },
  {
    topic: "Religious",
    emoji: "✝️",
    patterns: [/\bchurch\b/i, /\btbn\b/i, /\bgospel\b/i, /\bislamic\b/i, /\bquran\b/i, /\bbible\b/i],
  },
];

// Common networks we want to surface explicitly when present.
const NETWORKS = [
  "ABC",
  "CBS",
  "NBC",
  "FOX",
  "PBS",
  "BBC",
  "ITV",
  "CNN",
  "MSNBC",
  "ESPN",
  "ESPN+",
  "ESPN2",
  "TNT",
  "TBS",
  "TLC",
  "HBO",
  "HBO MAX",
  "MAX",
  "AMC",
  "FX",
  "FXX",
  "AMC+",
  "USA NETWORK",
  "USA",
  "BRAVO",
  "SHOWTIME",
  "STARZ",
  "PARAMOUNT",
  "PARAMOUNT+",
  "PEACOCK",
  "DISNEY",
  "DISNEY+",
  "DISNEY JR",
  "DISNEY XD",
  "NICKELODEON",
  "NICK JR",
  "NICKTOONS",
  "CARTOON NETWORK",
  "BOOMERANG",
  "DISCOVERY",
  "HISTORY",
  "NAT GEO",
  "NATIONAL GEOGRAPHIC",
  "ANIMAL PLANET",
  "FOOD NETWORK",
  "HGTV",
  "MTV",
  "VH1",
  "BET",
  "TMC",
  "SUNDANCE",
  "CINEMAX",
  "CRAVE",
  "TSN",
  "SPORTSNET",
  "CTV",
  "GLOBAL",
  "SKY",
  "SKY SPORTS",
  "SKY NEWS",
  "SKY ATLANTIC",
  "SKY CINEMA",
  "BT SPORT",
  "DAZN",
  "BEIN",
  "BEIN SPORTS",
  "FLOSPORTS",
  "FLORUGBY",
  "FLOWRESTLING",
  "FLOLIVE",
];

const QUALITY_RE = /\b(4K|UHD|FHD|FULL\s?HD|HEVC|H265|H\.265|HD|SD)\b/i;

function detectQuality(input: string): {
  quality?: string;
  cleaned: string;
} {
  const m = input.match(QUALITY_RE);
  if (!m) return { cleaned: input };
  const cleaned = input.replace(QUALITY_RE, " ").replace(/\s{2,}/g, " ").trim();
  // Normalize the label.
  const raw = m[0].toUpperCase().replace(/\s+/g, "");
  const quality =
    raw === "FULLHD" ? "FHD" :
    raw === "H265" || raw === "H.265" || raw === "HEVC" ? "HEVC" :
    raw;
  return { quality, cleaned };
}

function detectCountry(input: string): {
  country?: { flag: string; name: string; iso2?: string };
  cleaned: string;
} {
  // Try common formats:
  //   [USA] ...        → bracket prefix
  //   USA - ...        → dash prefix
  //   US (ESPN+) | ... → pipe-separated US-prefix
  //   [UK-CHAMP] ...   → "UK" inside bracket with subtag
  const bracket = input.match(/^\s*\[([A-Z][A-Z0-9-]{0,8})\]\s*/);
  if (bracket) {
    const code = bracket[1].split("-")[0].toUpperCase();
    const c = COUNTRY_LOOKUP[code];
    if (c) return { country: c, cleaned: input.slice(bracket[0].length) };
  }
  const dash = input.match(/^\s*([A-Z]{2,3})\s*[-–|]\s*/);
  if (dash) {
    const code = dash[1].toUpperCase();
    const c = COUNTRY_LOOKUP[code];
    if (c) return { country: c, cleaned: input.slice(dash[0].length) };
  }
  return { cleaned: input };
}

function detectNetwork(input: string): string | undefined {
  const upper = input.toUpperCase();
  // Prefer the longest matching network name to avoid "USA" matching when
  // "USA NETWORK" is present.
  let best: string | undefined;
  for (const n of NETWORKS) {
    const re = new RegExp(`\\b${n.replace(/\+/g, "\\+")}\\b`, "i");
    if (re.test(upper) && (!best || n.length > best.length)) best = n;
  }
  if (!best) return undefined;
  // Title-case the network name nicely.
  return best
    .split(/\s+/)
    .map((w) =>
      w === "FX" || w === "BBC" || w === "ABC" || w === "CBS" || w === "NBC" ||
      w === "FOX" || w === "PBS" || w === "CNN" || w === "MSNBC" ||
      w === "ESPN" || w === "TNT" || w === "TBS" || w === "TLC" ||
      w === "HBO" || w === "AMC" || w === "FXX" || w === "USA" ||
      w === "MTV" || w === "VH1" || w === "BET" || w === "TMC" ||
      w === "BEIN" || w === "DAZN" || w === "TSN" || w === "ITV" ||
      w === "MAX" || w === "DIY" || w === "HGTV" || w === "AMC+" ||
      w === "ESPN+" || w === "ESPN2" || w === "DISNEY+" || w === "PARAMOUNT+" ||
      w === "JR" || w === "XD"
        ? w
        : w[0] + w.slice(1).toLowerCase()
    )
    .join(" ");
}

function detectTopic(input: string):
  | { topic: string; emoji: string }
  | undefined {
  for (const t of TOPICS) {
    if (t.patterns.some((re) => re.test(input))) {
      return { topic: t.topic, emoji: t.emoji };
    }
  }
  return undefined;
}

function extractDetail(input: string, network?: string): string | undefined {
  // Strip leading network words and trailing parenthetical noise. Works
  // best for things like "CBS 12 SHERMAN TX (KXII)" → "Sherman TX".
  let s = input;
  if (network) {
    const re = new RegExp(`\\b${network.replace(/[+]/g, "\\+")}\\b`, "i");
    s = s.replace(re, " ");
  }
  // Drop short numeric tokens and common filler.
  s = s
    .replace(/\([^)]*\)/g, " ")
    .replace(/\|.*/g, " ")
    .replace(/\b(channel|the|tv|hd|sd|fhd|uhd|4k|hevc|live|stream|us|usa|uk|en)\b/gi, " ")
    .replace(/[^A-Za-z0-9 &/'-]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Title-case the first 4 words max so it stays compact.
  if (!s) return undefined;
  const words = s.split(/\s+/).slice(0, 4);
  if (words.length === 0) return undefined;
  return words
    .map((w) =>
      w.length <= 3 && w === w.toUpperCase()
        ? w
        : w[0].toUpperCase() + w.slice(1).toLowerCase()
    )
    .join(" ");
}

/**
 * Infer ISO-2 from an Xtream *category* title (e.g. "USA | GENERAL",
 * "UK-SPORTS"). Prefer this over parsing the channel name alone when both
 * are available — category buckets are usually a stronger region signal.
 */
export function inferCountryFromCategory(categoryTitle: string): string | undefined {
  const text = (categoryTitle || "").trim();
  if (!text) return undefined;
  const rows = [...COUNTRY_TABLE]
    .filter((r) => r.iso2)
    .sort(
      (a, b) =>
        Math.max(...b.codes.map((c) => c.length)) -
        Math.max(...a.codes.map((c) => c.length))
    );
  for (const row of rows) {
    const iso = row.iso2!;
    for (const code of row.codes) {
      if (code.length < 2) continue;
      const esc = code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re =
        code.length <= 3
          ? new RegExp(`(^|[^A-Za-z0-9])${esc}([^A-Za-z0-9]|$)`, "i")
          : new RegExp(`\\b${esc}\\b`, "i");
      if (re.test(text)) return iso;
    }
  }
  return undefined;
}

export function parseChannelMeta(rawName: string): ChannelMeta {
  const name = (rawName || "").trim();
  if (!name) return { isEmpty: true };

  // 1. Country
  const { country, cleaned: afterCountry } = detectCountry(name);
  // 2. Quality
  const { quality, cleaned: afterQuality } = detectQuality(afterCountry);
  // 3. Topic — run on the original name so we can catch keywords anywhere.
  const topicHit = detectTopic(name);
  // 4. Network
  const network = detectNetwork(afterQuality);
  // 5. Detail — try to surface a useful chunk (city / event / sub-league).
  const detail = extractDetail(afterQuality, network);

  const meta: ChannelMeta = {
    flag: country?.flag,
    country: country?.name,
    countryCode: country?.iso2,
    quality,
    network,
    topic: topicHit?.topic,
    topicEmoji: topicHit?.emoji,
    detail: detail && detail.toLowerCase() !== (network || "").toLowerCase() ? detail : undefined,
  };

  meta.isEmpty =
    !meta.flag &&
    !meta.country &&
    !meta.network &&
    !meta.topic &&
    !meta.quality &&
    !meta.detail;

  return meta;
}
