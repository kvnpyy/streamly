export type PlayerAudioTrack = {
  id: number;
  label: string;
  lang?: string;
};

type HlsAudioTrackLike = {
  name?: string;
  lang?: string;
  audioCodec?: string;
};

/** Spoken names and ISO codes that show up on IPTV panels. */
const LANGUAGE_NAMES: Record<string, string> = {
  english: "en",
  eng: "en",
  french: "fr",
  français: "fr",
  francais: "fr",
  fre: "fr",
  fra: "fr",
  spanish: "es",
  español: "es",
  espanol: "es",
  spa: "es",
  portuguese: "pt",
  português: "pt",
  portugues: "pt",
  por: "pt",
  german: "de",
  deutsch: "de",
  ger: "de",
  deu: "de",
  italian: "it",
  italiano: "it",
  ita: "it",
  dutch: "nl",
  nederlands: "nl",
  dut: "nl",
  nld: "nl",
  arabic: "ar",
  ara: "ar",
  russian: "ru",
  rus: "ru",
  polish: "pl",
  pol: "pl",
  turkish: "tr",
  tur: "tr",
  hindi: "hi",
  hin: "hi",
  japanese: "ja",
  jpn: "ja",
  korean: "ko",
  kor: "ko",
  chinese: "zh",
  chi: "zh",
  zho: "zh",
};

export function normalizeAudioLanguage(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const t = raw.trim().toLowerCase().replace(/_/g, "-");
  if (!t || t === "und" || t === "unknown" || t === "undetermined") return undefined;
  if (LANGUAGE_NAMES[t]) return LANGUAGE_NAMES[t];
  const primary = t.split("-")[0] ?? t;
  if (LANGUAGE_NAMES[primary]) return LANGUAGE_NAMES[primary];
  if (/^[a-z]{2,3}$/.test(primary)) return primary;
  return undefined;
}

/** Languages named on a track, from its code or a label like "English 5.1". */
export function audioTrackLanguageCodes(track: {
  lang?: string;
  name?: string;
}): string[] {
  const codes = new Set<string>();
  const fromLang = normalizeAudioLanguage(track.lang);
  if (fromLang) codes.add(fromLang);
  const name = (track.name ?? "").trim().toLowerCase();
  if (!name) return [...codes];
  const direct = normalizeAudioLanguage(name);
  if (direct) codes.add(direct);
  for (const token of name.split(/[^a-zà-ÿ]+/i)) {
    const code = normalizeAudioLanguage(token);
    if (code) codes.add(code);
  }
  return [...codes];
}

/** Higher means a closer match to the viewer's language list. 0 means no match. */
export function audioTrackLanguageRank(
  track: { lang?: string; name?: string },
  preferredLanguages: readonly string[]
): number {
  const codes = audioTrackLanguageCodes(track);
  const preferred = preferredLanguages
    .map((lang) => normalizeAudioLanguage(lang))
    .filter((lang): lang is string => Boolean(lang));
  for (let i = 0; i < preferred.length; i++) {
    if (codes.includes(preferred[i])) return preferred.length - i;
  }
  return 0;
}

export function audioTrackMatchesPreferred(
  track: { lang?: string; name?: string },
  preferredLanguages: readonly string[]
): boolean {
  return audioTrackLanguageRank(track, preferredLanguages) > 0;
}

/** Browser languages, with English as a fallback when it isn't already listed. */
export function viewerPreferredAudioLanguages(): string[] {
  if (typeof navigator === "undefined") return ["en"];
  const fromBrowser = navigator.languages?.length
    ? [...navigator.languages]
    : navigator.language
      ? [navigator.language]
      : [];
  const preferred = fromBrowser.filter((lang) => lang.trim());
  if (!preferred.some((lang) => normalizeAudioLanguage(lang) === "en")) {
    preferred.push("en");
  }
  return preferred.length ? preferred : ["en"];
}

/** Lower is easier for a browser to decode. AAC beats unlabeled, which beats Dolby/DTS. */
function browserAudioCodecRank(codec: string | undefined): number {
  const c = (codec ?? "").toLowerCase();
  if (c.includes("mp4a") || c.includes("aac")) return 0;
  if (c.includes("opus")) return 1;
  if (
    c.includes("ec-3") ||
    c.includes("eac3") ||
    c.includes("ac-3") ||
    c.includes("ac3") ||
    c.includes("dts")
  ) {
    return 4;
  }
  return 2;
}

/**
 * Pick a track the browser can play, and among those prefer the viewer's language.
 * English Dolby loses to French AAC — otherwise the show would be silent.
 */
export function pickBrowserFriendlyAudioTrackIndex(
  tracks: HlsAudioTrackLike[],
  preferredLanguages: readonly string[]
): number {
  if (!tracks.length) return -1;
  let bestCodec = browserAudioCodecRank(tracks[0].audioCodec);
  for (let i = 1; i < tracks.length; i++) {
    bestCodec = Math.min(bestCodec, browserAudioCodecRank(tracks[i].audioCodec));
  }
  let bestIdx = -1;
  let bestLang = -1;
  for (let i = 0; i < tracks.length; i++) {
    if (browserAudioCodecRank(tracks[i].audioCodec) !== bestCodec) continue;
    const lang = audioTrackLanguageRank(tracks[i], preferredLanguages);
    if (bestIdx < 0 || lang > bestLang) {
      bestIdx = i;
      bestLang = lang;
    }
  }
  return bestIdx;
}

export function audioCodecShortLabel(codec: string | undefined): string | undefined {
  const c = (codec ?? "").toLowerCase();
  if (!c) return undefined;
  if (c.includes("mp4a") || c.includes("aac")) return "AAC";
  if (c.includes("opus")) return "Opus";
  if (c.includes("ec-3") || c.includes("eac3")) return "E-AC-3";
  if (c.includes("ac-3") || c.includes("ac3")) return "AC-3";
  if (c.includes("dts")) return "DTS";
  return codec;
}

export function mapHlsAudioTracks(tracks: HlsAudioTrackLike[]): PlayerAudioTrack[] {
  return tracks.map((track, index) => {
    const codec = audioCodecShortLabel(track.audioCodec);
    const base =
      track.name?.trim() ||
      track.lang?.trim() ||
      (codec ? `Audio (${codec})` : `Audio ${index + 1}`);
    return {
      id: index,
      label: base,
      lang: track.lang || undefined,
    };
  });
}
