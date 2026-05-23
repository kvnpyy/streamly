/**
 * Geo-continent detection for TV region filtering.
 *
 * How it works:
 *  1. Read the browser timezone via Intl.DateTimeFormat (always available, no API call).
 *  2. Map timezone prefix → continent.
 *  3. Separately, try to extract a 2-3 letter ISO country code from an IPTV
 *     category name (most providers use "US | ESPN", "CA | TSN", "DE | ARD" etc.)
 *     and map that code to a continent.
 *  4. Categories with NO detectable country prefix are treated as "generic" and
 *     always shown regardless of the active region filter.
 */

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

/**
 * Extract a 2-3 letter country code from an IPTV category name.
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

  // Pattern 1: [XX] or [XXX] at start — most common bracket style
  let m = name.match(/^\[([A-Za-z]{2,4})\]/);
  if (m) return m[1]!.toUpperCase();

  // Pattern 2: (XX) or (XXX) at start
  m = name.match(/^\(([A-Za-z]{2,4})\)/);
  if (m) return m[1]!.toUpperCase();

  // Pattern 3: | XX | or |XX| at start (leading-pipe style)
  m = name.match(/^\|\s*([A-Za-z]{2,4})\s*\|/);
  if (m) return m[1]!.toUpperCase();

  // Pattern 4: XX | or XX: or XX - at start (standard prefix + separator)
  m = name.match(/^([A-Za-z]{2,4})\s*[\|:\-–\/\\]/);
  if (m) return m[1]!.toUpperCase();

  // Pattern 5: skip leading non-ASCII (emoji flags like 🇬🇧) then retry patterns 1-4
  const stripped = name.replace(/^[^\x00-\x7F\s]+\s*/, "");
  if (stripped !== name && stripped.length > 0) {
    return extractCountryCode(stripped);
  }

  return null;
}

/**
 * Get the region for a category.
 * Returns null when the category has no detectable country prefix —
 * these "generic" categories (Sports, Movies, News…) should always be shown.
 */
export function getCategoryRegion(categoryName: string): TvRegion | null {
  const code = extractCountryCode(categoryName);
  if (!code) return null;
  return CODE_TO_REGION[code] ?? null;
}

/**
 * Decide whether a category should be visible under the given region filter.
 *
 * Logic:
 *  - "All" → always visible
 *  - Category has no detectable country code → always visible (generic)
 *  - Category country code matches filter region → visible
 *  - Otherwise → hidden
 */
export function categoryMatchesRegion(
  categoryName: string,
  region: TvRegion
): boolean {
  if (region === "All") return true;
  const catRegion = getCategoryRegion(categoryName);
  if (catRegion === null) return true; // generic / no prefix
  return catRegion === region;
}
