/**
 * Geo-continent detection for TV region filtering.
 *
 * How it works:
 *  1. Read the browser timezone via Intl.DateTimeFormat (always available, no API call).
 *  2. Map timezone prefix → continent.
 *  3. Extract country codes from IPTV category/channel names ("US | ESPN", "CA | TSN",
 *     "Canada | CBC", "[CANADA] …") and map to a continent. Full country names use the
 *     same rules as {@link inferCountryFromCategory} in channel-meta.
 *  4. Categories with NO detectable country signal are "generic" (shown on all regions,
 *     with per-channel filtering when the shelf is built).
 */

import { inferCountryFromCategory, parseChannelMeta } from "@/lib/channel-meta";
import type { Category } from "@/lib/xtream-types";

export type TvRegion =
  | "North America"
  | "Latin America"
  | "Europe"
  | "Asia"
  | "Middle East"
  | "Africa"
  | "Oceania"
  | "All";

export const ALL_TV_REGIONS: TvRegion[] = [
  "All",
  "North America",
  "Latin America",
  "Europe",
  "Asia",
  "Middle East",
  "Africa",
  "Oceania",
];

/** Canadian IANA timezones — used to prioritize CA shelves on North America browse. */
const CANADIAN_TIMEZONES = new Set([
  "America/Toronto",
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Halifax",
  "America/St_Johns",
  "America/Regina",
  "America/Whitehorse",
  "America/Yellowknife",
  "America/Iqaluit",
  "America/Moncton",
  "America/Glace_Bay",
  "America/Goose_Bay",
  "America/Thunder_Bay",
  "America/Nipigon",
  "America/Rainy_River",
  "America/Atikokan",
  "America/Coral_Harbour",
  "America/Blanc-Sablon",
  "America/Creston",
  "America/Dawson",
  "America/Dawson_Creek",
  "America/Fort_Nelson",
  "America/Inuvik",
  "America/Rankin_Inlet",
  "America/Resolute",
  "America/Swift_Current",
  "America/Pangnirtung",
]);

// ---------------------------------------------------------------------------
// Country-code → region lookup (ISO 3166-1 alpha-2 and common 3-letter codes)
// ---------------------------------------------------------------------------
const CODE_TO_REGION: Record<string, TvRegion> = {
  // North America
  US: "North America", USA: "North America",
  CA: "North America", CAN: "North America",

  // Latin America (Mexico treated as LatAm for IPTV purposes)
  MX: "Latin America", MEX: "Latin America",
  BR: "Latin America", BRA: "Latin America",
  AR: "Latin America", ARG: "Latin America",
  CO: "Latin America", COL: "Latin America",
  PE: "Latin America", PER: "Latin America",
  CL: "Latin America", CHI: "Latin America",
  VE: "Latin America", VEN: "Latin America",
  EC: "Latin America",
  BO: "Latin America", BOL: "Latin America",
  PY: "Latin America",
  UY: "Latin America", URU: "Latin America",
  CR: "Latin America",
  GT: "Latin America",
  CU: "Latin America",
  DO: "Latin America",
  HN: "Latin America",
  PA: "Latin America",
  PR: "Latin America",
  SV: "Latin America",
  NI: "Latin America",
  JM: "Latin America",
  TT: "Latin America",
  HT: "Latin America",

  // Europe
  UK: "Europe", GB: "Europe", GBR: "Europe", ENG: "Europe",
  IE: "Europe", IRL: "Europe",
  FR: "Europe", FRA: "Europe",
  DE: "Europe", GER: "Europe",
  ES: "Europe", ESP: "Europe",
  IT: "Europe", ITA: "Europe",
  NL: "Europe", NED: "Europe", HOL: "Europe",
  BE: "Europe", BEL: "Europe",
  CH: "Europe", SUI: "Europe", CHE: "Europe",
  AT: "Europe", AUT: "Europe",
  PT: "Europe", POR: "Europe",
  PL: "Europe", POL: "Europe",
  RO: "Europe", ROU: "Europe",
  HU: "Europe", HUN: "Europe",
  GR: "Europe", GRC: "Europe",
  SE: "Europe", SWE: "Europe", SW: "Europe", SVE: "Europe",
  NO: "Europe", NOR: "Europe",
  DK: "Europe", DEN: "Europe", DNK: "Europe",
  FI: "Europe", FIN: "Europe",
  CZ: "Europe", CZE: "Europe",
  SK: "Europe", SVK: "Europe",
  HR: "Europe", CRO: "Europe",
  RS: "Europe", SRB: "Europe",
  BA: "Europe", BIH: "Europe",
  SI: "Europe", SVN: "Europe",
  BG: "Europe", BGR: "Europe",
  LV: "Europe",
  LT: "Europe", LIT: "Europe",
  EE: "Europe", EST: "Europe",
  LU: "Europe",
  AL: "Europe", ALB: "Europe",
  MK: "Europe",
  ME: "Europe",
  CY: "Europe",
  MT: "Europe",
  RU: "Europe", RUS: "Europe",
  UA: "Europe", UKR: "Europe",
  BY: "Europe", BLR: "Europe",
  TR: "Europe", TUR: "Europe",
  IS: "Europe", ISL: "Europe",
  MD: "Europe",
  XK: "Europe",
  // Regional IPTV blocks (not ISO countries)
  EU: "Europe",
  AFR: "Africa",
  AFRICA: "Africa",
  ASIA: "Asia",
  NA: "North America",
  LAT: "Latin America",
  LATAM: "Latin America",
  ARAB: "Middle East",
  ARABIC: "Middle East",

  // Non-standard IPTV provider abbreviations
  SCO: "Europe",  // Scotland
  WAL: "Europe",  // Wales
  NIR: "Europe",  // Northern Ireland
  SCT: "Europe",  // Scotland alt
  BOS: "Europe",  // Bosnia alt
  MON: "Europe",  // Montenegro alt
  SER: "Europe",  // Serbia alt
  EXYU: "Europe", // Ex-Yugoslavia block
  YU: "Europe",   // Yugoslavia legacy

  // Middle East
  SA: "Middle East", KSA: "Middle East", SAU: "Middle East",
  AE: "Middle East", UAE: "Middle East",
  QA: "Middle East", QAT: "Middle East",
  KW: "Middle East", KWT: "Middle East",
  BH: "Middle East", BAH: "Middle East", BHR: "Middle East",
  OM: "Middle East", OMN: "Middle East",
  JO: "Middle East", JOR: "Middle East",
  LB: "Middle East", LBN: "Middle East",
  SY: "Middle East", SYR: "Middle East",
  IL: "Middle East", ISR: "Middle East",
  IQ: "Middle East", IRQ: "Middle East",
  IR: "Middle East", IRN: "Middle East",
  YE: "Middle East", YEM: "Middle East",
  PS: "Middle East",

  // Asia
  CN: "Asia", CHN: "Asia",
  JP: "Asia", JPN: "Asia",
  KR: "Asia", KOR: "Asia",
  IN: "Asia", IND: "Asia",
  PK: "Asia", PAK: "Asia",
  BD: "Asia", BGD: "Asia",
  PH: "Asia", PHI: "Asia",
  VN: "Asia", VIE: "Asia",
  TH: "Asia", THA: "Asia",
  MY: "Asia", MAL: "Asia", MYS: "Asia",
  SG: "Asia", SGP: "Asia",
  ID: "Asia", IDN: "Asia",
  MM: "Asia", MYA: "Asia",
  KH: "Asia", CAM: "Asia",
  LA: "Asia",
  MN: "Asia",
  NP: "Asia", NPL: "Asia",
  LK: "Asia",
  HK: "Asia", HKG: "Asia",
  TW: "Asia", TWN: "Asia",
  AZ: "Asia", AZE: "Asia",
  GE: "Asia", GEO: "Asia",
  AM: "Asia", ARM: "Asia",
  KZ: "Asia", KAZ: "Asia",
  UZ: "Asia", UZB: "Asia",
  TM: "Asia",
  TJ: "Asia",
  KG: "Asia",
  AF: "Asia", AFG: "Asia",
  MO: "Asia",
  MAC: "Europe",  // Macedonia (IPTV providers use MAC for Macedonia, not Macau)

  // Africa
  ZA: "Africa", RSA: "Africa", SAF: "Africa",
  NG: "Africa", NGA: "Africa",
  KE: "Africa", KEN: "Africa",
  ET: "Africa", ETH: "Africa",
  EG: "Africa", EGY: "Africa",
  TZ: "Africa",
  UG: "Africa",
  GH: "Africa",
  MA: "Africa", MAR: "Africa",
  TN: "Africa", TUN: "Africa",
  DZ: "Africa", ALG: "Africa",
  LY: "Africa",
  SD: "Africa",
  ZW: "Africa",
  ZM: "Africa",
  MZ: "Africa",
  AO: "Africa",
  CM: "Africa",
  SN: "Africa",
  CI: "Africa",
  CD: "Africa",
  SO: "Africa",
  MG: "Africa",
  TG: "Africa",
  BJ: "Africa",
  RW: "Africa",
  SS: "Africa",

  // Oceania
  AU: "Oceania", AUS: "Oceania",
  NZ: "Oceania", NZL: "Oceania",
  FJ: "Oceania",
  PG: "Oceania",
  SB: "Oceania",
  WS: "Oceania",
};

/** Prefix tokens from IPTV panels → ISO 3166-1 alpha-2. */
const PREFIX_ALIAS_TO_ISO: Record<string, string> = {
  USA: "US",
  US: "US",
  CAN: "CA",
  CA: "CA",
  CANADA: "CA",
  GBR: "GB",
  UK: "GB",
  ENG: "GB",
  ALB: "AL",
};

/**
 * Bracket/dash prefixes that mean language, not geography (common on 24/7 rows).
 * `[EN] COBRA KAI` under a US 24/7 category is English-language, not UK/Europe.
 */
const LANGUAGE_ONLY_PREFIX_CODES = new Set([
  "EN",
  "ENG",
  "MULTI",
  "INT",
  "GLOBAL",
]);

export function isLanguageOnlyPrefix(code: string | null | undefined): boolean {
  if (!code?.trim()) return false;
  return LANGUAGE_ONLY_PREFIX_CODES.has(code.trim().toUpperCase());
}

/** Provider category rows like `[US] 24/7 ENGLISH MOVIES/SERIES 4K`. */
export function categoryHas24_7(categoryName: string): boolean {
  return /\b24\s*\/\s*7\b/i.test(categoryName);
}

function northAmericaCategoryContext(categoryName: string): boolean {
  const iso = getCategoryCountryIso(categoryName);
  return (
    iso === "US" ||
    iso === "CA" ||
    categoryHas24_7(categoryName)
  );
}

/**
 * Map an ISO 3166-1 alpha-2 country code (from IP headers) to a TV region.
 */
export function detectRegionFromCountryCode(
  countryCode: string | null | undefined
): TvRegion | null {
  if (!countryCode?.trim()) return null;
  const iso = countryCode.trim().toUpperCase();
  if (iso.length !== 2) return null;
  return countryIsoToTvRegion(iso);
}

/** Default VOD language filter for a TV region (null = show all languages). */
export function defaultVodLanguageForRegion(
  region: TvRegion
): string | null {
  switch (region) {
    case "North America":
    case "Oceania":
      return "EN";
    case "Latin America":
      return "ES";
    default:
      return null;
  }
}

/**
 * Detect the user's region from the browser timezone.
 * Returns "All" if detection fails or the timezone is ambiguous.
 */
export function detectRegionFromTimezone(): TvRegion {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return "All";

    const [prefix, city = ""] = tz.split("/");

    if (prefix === "America") {
      // South/Central American cities that share the "America/" prefix
      const latinCities = [
        "Sao_Paulo", "Buenos_Aires", "Bogota", "Lima", "Santiago", "Caracas",
        "La_Paz", "Asuncion", "Montevideo", "Guayaquil", "Manaus", "Fortaleza",
        "Belem", "Recife", "Maceio", "Bahia", "Cuiaba", "Porto_Velho",
        "Rio_Branco", "Boa_Vista", "Santarem", "Noronha", "Cayenne",
        "Paramaribo", "Georgetown", "Mexico_City", "Cancun", "Monterrey",
        "Hermosillo", "Chihuahua", "Tijuana", "Mazatlan", "Merida",
        "Costa_Rica", "Guatemala", "El_Salvador", "Tegucigalpa", "Managua",
        "Panama", "Havana", "Port-au-Prince", "Santo_Domingo",
        "Puerto_Rico", "Curacao", "Aruba", "Caracas", "Guyana",
      ];
      if (latinCities.some((c) => city.startsWith(c.split("_")[0]!))) {
        return "Latin America";
      }
      return "North America";
    }
    if (prefix === "Europe") return "Europe";
    if (prefix === "Asia") {
      const meTz: string[] = [
        "Asia/Riyadh", "Asia/Dubai", "Asia/Qatar", "Asia/Kuwait",
        "Asia/Bahrain", "Asia/Muscat", "Asia/Amman", "Asia/Beirut",
        "Asia/Damascus", "Asia/Jerusalem", "Asia/Baghdad", "Asia/Tehran",
        "Asia/Aden", "Asia/Gaza", "Asia/Hebron",
      ];
      if (meTz.includes(tz)) return "Middle East";
      return "Asia";
    }
    if (prefix === "Africa") return "Africa";
    if (prefix === "Australia" || prefix === "Pacific") return "Oceania";
  } catch {
    /* noop — Intl not supported */
  }
  return "All";
}

/** True when the browser timezone is in Canada (used to surface CA shelves first). */
export function isCanadianTimezone(): boolean {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz ? CANADIAN_TIMEZONES.has(tz) : false;
  } catch {
    return false;
  }
}

/**
 * Extract a 2-6 letter country prefix from an IPTV category or channel name.
 *
 * Handles every common provider naming pattern:
 *   "US | ESPN"       standard prefix + separator
 *   "USA: Sports"     3-letter + colon
 *   "GB - BBC One"    dash separator
 *   "[UK] GENERAL"    square-bracket prefix
 *   "[UK] SPORTS"     square-bracket prefix
 *   "(UK) Sports"     paren prefix
 *   "| UK | Sports"   leading-pipe prefix
 *   "|UK| ITV"        tight pipe wrap
 *
 * Returns null if no country prefix is found (the category is "generic").
 */
export function extractCountryCode(categoryName: string): string | null {
  const name = categoryName.trim();

  // Pattern 1: [XX] or [CANADA] at start — most common bracket style
  let m = name.match(/^\[([A-Za-z]{2,6})\]/);
  if (m) return m[1]!.toUpperCase();

  // Pattern 2: (XX) or (CANADA) at start
  m = name.match(/^\(([A-Za-z]{2,6})\)/);
  if (m) return m[1]!.toUpperCase();

  // Pattern 3: | XX | or |XX| at start (leading-pipe style)
  m = name.match(/^\|\s*([A-Za-z]{2,6})\s*\|/);
  if (m) return m[1]!.toUpperCase();

  // Pattern 4: XX | or XX: or XX - at start (standard prefix + separator)
  m = name.match(/^([A-Za-z]{2,6})\s*[\|:\-–\/\\]/);
  if (m) return m[1]!.toUpperCase();

  // Pattern 5: skip leading non-ASCII (emoji flags like 🇬🇧) then retry patterns 1-4
  const stripped = name.replace(/^[^\x00-\x7F\s]+\s*/, "");
  if (stripped !== name && stripped.length > 0) {
    return extractCountryCode(stripped);
  }

  return null;
}

/** Normalize a panel prefix or ISO code to alpha-2 (US, CA, GB, …). */
export function normalizeCountryIso(token: string | null | undefined): string | null {
  if (!token?.trim()) return null;
  const u = token.trim().toUpperCase();
  if (isLanguageOnlyPrefix(u)) return null;
  if (PREFIX_ALIAS_TO_ISO[u]) return PREFIX_ALIAS_TO_ISO[u]!;
  if (u.length === 2 && CODE_TO_REGION[u]) return u;
  // 3–6 letter provider codes (ALB, SWE, …) and regional blocks (EU, LATAM)
  if (CODE_TO_REGION[u]) return PREFIX_ALIAS_TO_ISO[u] ?? u;
  return null;
}

/** ISO-2 from a category title (prefix + full country names). */
export function getCategoryCountryIso(categoryName: string): string | null {
  const rawPrefix = extractCountryCode(categoryName);
  if (rawPrefix && isLanguageOnlyPrefix(rawPrefix)) {
    /* fall through — e.g. [EN] 24/7 Movies should not read as UK */
  } else {
    const fromPrefix = normalizeCountryIso(rawPrefix);
    if (fromPrefix) return fromPrefix;
  }
  return inferCountryFromCategory(categoryName) ?? null;
}

/** ISO-2 from a channel title. */
export function getStreamCountryIso(channelName: string): string | null {
  const rawPrefix = extractCountryCode(channelName);
  if (!rawPrefix || isLanguageOnlyPrefix(rawPrefix)) {
    /* [EN] marathons are language tags, not Europe */
  } else {
    const fromPrefix = normalizeCountryIso(rawPrefix);
    if (fromPrefix) return fromPrefix;
  }
  const inferred = inferCountryFromCategory(channelName);
  if (inferred === "GB" && rawPrefix && isLanguageOnlyPrefix(rawPrefix)) {
    return null;
  }
  return (
    inferred ??
    parseChannelMeta(channelName).countryCode ??
    null
  );
}

export function countryIsoToTvRegion(iso: string): TvRegion | null {
  const code = iso.toUpperCase();
  if (code === "CA") return "North America";
  return CODE_TO_REGION[code] ?? null;
}

/**
 * Get the continent region for a category.
 * Returns null when no country is detected (generic — Sports, Movies, …).
 */
export function getCategoryRegion(categoryName: string): TvRegion | null {
  const iso = getCategoryCountryIso(categoryName);
  if (!iso) return null;
  return countryIsoToTvRegion(iso);
}

/**
 * Get the continent region for a channel name.
 */
export function getStreamRegion(channelName: string): TvRegion | null {
  const iso = getStreamCountryIso(channelName);
  if (!iso) return null;
  return countryIsoToTvRegion(iso);
}

/**
 * Decide whether a category should be visible under the given region filter.
 */
export function categoryMatchesRegion(
  categoryName: string,
  region: TvRegion
): boolean {
  if (region === "All") return true;
  if (region === "North America" && categoryHas24_7(categoryName)) {
    const iso = getCategoryCountryIso(categoryName);
    if (iso === null || iso === "US" || iso === "CA") return true;
  }
  const catRegion = getCategoryRegion(categoryName);
  if (catRegion === null) return true;
  return catRegion === region;
}

/**
 * Whether a channel belongs in the active region (uses category context for CA-only shelves).
 */
export function streamMatchesRegion(
  channelName: string,
  categoryName: string,
  region: TvRegion
): boolean {
  if (region === "All") return true;

  const rawStreamPrefix = extractCountryCode(channelName);
  if (
    region === "North America" &&
    isLanguageOnlyPrefix(rawStreamPrefix) &&
    northAmericaCategoryContext(categoryName)
  ) {
    return true;
  }

  const catRegion = getCategoryRegion(categoryName);
  if (catRegion !== null) {
    return catRegion === region;
  }

  const streamRegion = getStreamRegion(channelName);
  if (streamRegion === null) return true;
  return streamRegion === region;
}

/**
 * On North America, surface CA/US category groups before generic buckets —
 * many providers list hundreds of US rows before any Canadian groups.
 */
export function sortLiveCategoriesForBrowse(
  categories: Category[],
  region: TvRegion
): Category[] {
  if (region !== "North America") return categories;

  const rank = (name: string): number => {
    const iso = getCategoryCountryIso(name);
    if (iso === "CA") return 0;
    if (/\bcanad/i.test(name)) return 1;
    if (categoryHas24_7(name) && (iso === null || iso === "US" || iso === "CA")) {
      return 2;
    }
    if (iso === "US") return 3;
    if (iso === null) return 4;
    return 5;
  };

  return [...categories].sort((a, b) => {
    const d = rank(a.category_name) - rank(b.category_name);
    if (d !== 0) return d;
    return a.category_name.localeCompare(b.category_name);
  });
}

const VALID_TV_REGIONS = new Set<string>(ALL_TV_REGIONS);

/** Legacy persisted value from a brief Canada-only region experiment. */
export function coerceTvRegion(
  region: TvRegion | string | null | undefined
): TvRegion | null {
  if (region == null) return null;
  const trimmed = String(region).trim();
  if (trimmed === "Canada") return "North America";
  if (!VALID_TV_REGIONS.has(trimmed)) return null;
  return trimmed as TvRegion;
}

export function parseTvRegion(regionParam: string | null | undefined): TvRegion {
  const coerced = coerceTvRegion(regionParam);
  return coerced ?? "All";
}
