import { normalizeSearchText } from "@/lib/search-normalize";

/** On-air programme matches outrank channel-name-only hits. */
const PROGRAMME_TIER = 1_000_000;

function tokens(value: string): string[] {
  return value.split(" ").filter(Boolean);
}

function hasContiguousTokens(hay: string[], needle: string[]): boolean {
  if (needle.length === 0 || hay.length < needle.length) return false;
  for (let i = 0; i <= hay.length - needle.length; i++) {
    let ok = true;
    for (let j = 0; j < needle.length; j++) {
      if (hay[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/** "ufc" in "ufc 311 …" / "ufc311" — numbered events beat generic network names. */
function eventNumberBonus(hayTokens: string[], needleTokens: string[]): number {
  if (needleTokens.length === 0) return 0;

  for (let i = 0; i <= hayTokens.length - needleTokens.length; i++) {
    let match = true;
    for (let j = 0; j < needleTokens.length; j++) {
      if (hayTokens[i + j] !== needleTokens[j]) {
        match = false;
        break;
      }
    }
    if (!match) continue;
    const next = hayTokens[i + needleTokens.length];
    if (next && /^\d{2,4}$/.test(next)) return 220;
  }

  const compactNeedle = needleTokens.join("");
  for (const tok of hayTokens) {
    if (tok.length <= compactNeedle.length) continue;
    if (
      tok.startsWith(compactNeedle) &&
      /^\d{2,4}$/.test(tok.slice(compactNeedle.length))
    ) {
      return 220;
    }
  }
  return 0;
}

/** Score one normalized field (channel name or now-playing title). 0 = no match. */
export function scoreLiveSearchField(haystack: string, needle: string): number {
  if (!needle || !haystack.includes(needle)) return 0;

  let score = 20;
  if (haystack === needle) score += 800;
  if (haystack.startsWith(needle)) score += 400;

  const hayTokens = tokens(haystack);
  const needleTokens = tokens(needle);
  if (hasContiguousTokens(hayTokens, needleTokens)) {
    score += 300;
    if (hayTokens[0] === needleTokens[0]) score += 80;
  }

  score += eventNumberBonus(hayTokens, needleTokens);
  score += Math.round((needle.length / Math.max(haystack.length, 1)) * 50);
  return score;
}

/** Higher is a better live-search hit for `needleNormalized`. */
export function scoreLiveSearchHit(
  name: unknown,
  programmeTitle: unknown,
  needleNormalized: string
): number {
  if (!needleNormalized) return 0;
  const nameN = normalizeSearchText(name);
  const progN = normalizeSearchText(programmeTitle);
  const nameScore = scoreLiveSearchField(nameN, needleNormalized);
  const progScore = progN ? scoreLiveSearchField(progN, needleNormalized) : 0;
  if (progScore > 0) return PROGRAMME_TIER + progScore * 4 + nameScore;
  return nameScore;
}

export function sortLiveStreamsBySearchScore<T extends { name: string }>(
  streams: T[],
  needleNormalized: string,
  programmeTitle?: (item: T) => string | undefined
): T[] {
  if (!needleNormalized || streams.length < 2) return streams;
  const ranked = streams.map((stream, index) => ({
    stream,
    index,
    score: scoreLiveSearchHit(
      stream.name,
      programmeTitle?.(stream),
      needleNormalized
    ),
  }));
  ranked.sort((a, b) => b.score - a.score || a.index - b.index);
  return ranked.map((row) => row.stream);
}
