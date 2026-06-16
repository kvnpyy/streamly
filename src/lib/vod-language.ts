import { extractCountryCode } from "@/lib/geo-continent";
import type { Category } from "@/lib/xtream-types";

/** Panel prefix tokens → canonical 2-letter language codes. */
const LANGUAGE_ALIASES: Record<string, string> = {
  EN: "EN",
  ENG: "EN",
  ENGLISH: "EN",
  FR: "FR",
  FRA: "FR",
  FRENCH: "FR",
  NL: "NL",
  NED: "NL",
  DUTCH: "NL",
  HOL: "NL",
  DE: "DE",
  GER: "DE",
  DEU: "DE",
  GERMAN: "DE",
  ES: "ES",
  ESP: "ES",
  SPANISH: "ES",
  IT: "IT",
  ITA: "IT",
  ITALIAN: "IT",
  PT: "PT",
  POR: "PT",
  PORTUGUESE: "PT",
  AR: "AR",
  ARA: "AR",
  ARABIC: "AR",
  RU: "RU",
  RUS: "RU",
  RUSSIAN: "RU",
  PL: "PL",
  POL: "PL",
  POLISH: "PL",
  TR: "TR",
  TUR: "TR",
  TURKISH: "TR",
  JP: "JA",
  JPN: "JA",
  JAPANESE: "JA",
  JA: "JA",
  KO: "KO",
  KOR: "KO",
  KOREAN: "KO",
  ZH: "ZH",
  CHI: "ZH",
  CHINESE: "ZH",
  SV: "SV",
  SWE: "SV",
  SWEDISH: "SV",
  NO: "NO",
  NOR: "NO",
  NORWEGIAN: "NO",
  DA: "DA",
  DAN: "DA",
  DANISH: "DA",
  FI: "FI",
  FIN: "FI",
  FINNISH: "FI",
  RO: "RO",
  ROM: "RO",
  ROMANIAN: "RO",
  HU: "HU",
  HUN: "HU",
  HUNGARIAN: "HU",
  EL: "EL",
  GRC: "EL",
  GREEK: "EL",
  HE: "HE",
  HEB: "HE",
  HEBREW: "HE",
  HI: "HI",
  HINDI: "HI",
  MULTI: "MULTI",
  INT: "MULTI",
  GLOBAL: "MULTI",
};

const LANGUAGE_WORD_PATTERNS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\benglish\b/i, "EN"],
  [/\bfrench\b/i, "FR"],
  [/\bdutch\b/i, "NL"],
  [/\bgerman\b/i, "DE"],
  [/\bspanish\b/i, "ES"],
  [/\bitalian\b/i, "IT"],
  [/\bportuguese\b/i, "PT"],
  [/\barabic\b/i, "AR"],
  [/\brussian\b/i, "RU"],
  [/\bpolish\b/i, "PL"],
  [/\bturkish\b/i, "TR"],
  [/\bjapanese\b/i, "JA"],
  [/\bkorean\b/i, "KO"],
  [/\bchinese\b/i, "ZH"],
  [/\bswedish\b/i, "SV"],
  [/\bnorwegian\b/i, "NO"],
  [/\bdanish\b/i, "DA"],
  [/\bfinnish\b/i, "FI"],
  [/\bromanian\b/i, "RO"],
  [/\bhungarian\b/i, "HU"],
  [/\bgreek\b/i, "EL"],
  [/\bhebrew\b/i, "HE"],
  [/\bhindi\b/i, "HI"],
];

export const VOD_LANGUAGE_LABELS: Record<string, string> = {
  EN: "English",
  FR: "French",
  NL: "Dutch",
  DE: "German",
  ES: "Spanish",
  IT: "Italian",
  PT: "Portuguese",
  AR: "Arabic",
  RU: "Russian",
  PL: "Polish",
  TR: "Turkish",
  JA: "Japanese",
  KO: "Korean",
  ZH: "Chinese",
  SV: "Swedish",
  NO: "Norwegian",
  DA: "Danish",
  FI: "Finnish",
  RO: "Romanian",
  HU: "Hungarian",
  EL: "Greek",
  HE: "Hebrew",
  HI: "Hindi",
  MULTI: "Multi-language",
};

/** Human label for a canonical language code (e.g. EN → English). */
export function vodLanguageLabel(code: string): string {
  const u = code.trim().toUpperCase();
  return VOD_LANGUAGE_LABELS[u] ?? u;
}

/** Normalize a provider prefix token to a canonical language code, if known. */
export function normalizeVodLanguageCode(
  token: string | null | undefined
): string | null {
  if (!token?.trim()) return null;
  const u = token.trim().toUpperCase();
  return LANGUAGE_ALIASES[u] ?? null;
}

function languageFromWords(text: string): string | null {
  for (const [re, code] of LANGUAGE_WORD_PATTERNS) {
    if (re.test(text)) return code;
  }
  return null;
}

/** Extract a language code from a provider title or category name. */
export function extractVodLanguageCode(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const fromPrefix = normalizeVodLanguageCode(extractCountryCode(trimmed));
  if (fromPrefix) return fromPrefix;
  return languageFromWords(trimmed);
}

type NamedVodRow = { name: string; category_id?: string | number };

/** Best-effort language for a catalog row (title prefix, then category). */
export function vodItemLanguage(
  name: string,
  categoryName?: string | null
): string | null {
  return (
    extractVodLanguageCode(name) ??
    (categoryName ? extractVodLanguageCode(categoryName) : null)
  );
}

export function vodItemMatchesLanguage(
  name: string,
  lang: string,
  categoryName?: string | null
): boolean {
  const needle = normalizeVodLanguageCode(lang);
  if (!needle) return true;
  const itemLang = vodItemLanguage(name, categoryName);
  return itemLang === needle;
}

/** Languages detected across stream titles and category names. */
export function collectVodLanguages(
  streams: NamedVodRow[],
  categories: Category[]
): string[] {
  const catById = new Map(
    categories.map((c) => [String(c.category_id), c.category_name])
  );
  const langs = new Set<string>();

  for (const c of categories) {
    const code = extractVodLanguageCode(c.category_name);
    if (code) langs.add(code);
  }

  for (const s of streams) {
    const code = vodItemLanguage(
      s.name,
      catById.get(String(s.category_id ?? ""))
    );
    if (code) langs.add(code);
  }

  return [...langs].sort((a, b) =>
    vodLanguageLabel(a).localeCompare(vodLanguageLabel(b))
  );
}

export function isVodLanguageFilterActive(
  lang: string | "all" | null | undefined
): boolean {
  return Boolean(lang && lang !== "all");
}

/** All language codes the filter UI and server accept. */
export const ALL_VOD_LANGUAGE_CODES: readonly string[] = Object.keys(
  VOD_LANGUAGE_LABELS
).sort((a, b) => vodLanguageLabel(a).localeCompare(vodLanguageLabel(b)));

/** Popular shortcuts shown before opening the full picker. */
export const POPULAR_VOD_LANGUAGE_CODES: readonly string[] = [
  "EN",
  "FR",
  "NL",
  "DE",
  "ES",
  "IT",
  "PT",
  "PL",
  "TR",
  "AR",
  "RU",
  "JA",
  "KO",
  "ZH",
];

export function isKnownVodLanguageCode(
  code: string | null | undefined
): boolean {
  const normalized = normalizeVodLanguageCode(code);
  return Boolean(normalized && VOD_LANGUAGE_LABELS[normalized]);
}

/** Detected catalog codes first, then popular shortcuts (deduped). */
export function buildVodLanguageFeaturedOptions(detected: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of detected) {
    const code = normalizeVodLanguageCode(raw);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  for (const code of POPULAR_VOD_LANGUAGE_CODES) {
    if (seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}
