import { parseChannelMeta } from "@/lib/channel-meta";
import type { LiveStream } from "@/lib/xtream-types";
import type { TonightProgram } from "@/lib/discovery/live-epg";

const MAJOR_NETWORKS = new Set([
  "ESPN",
  "FOX",
  "NBC",
  "ABC",
  "CBS",
  "CNN",
  "BBC",
  "ITV",
  "SKY",
  "TLC",
  "MTV",
  "HBO",
  "TNT",
  "TBS",
  "USA",
  "AMC",
  "DISCOVERY",
  "DISC",
  "NICKELODEON",
  "NICK",
  "FOOD",
  "HGTV",
  "BRAVO",
  "E!",
  "FX",
  "SHOWTIME",
  "STARZ",
  "CW",
  "PBS",
  "NFL",
  "NBA",
  "MLB",
]);

import { SPORTS_PROGRAMME_PATTERNS } from "@/lib/discovery/sports-keywords";

/** Entertainment / live-TV hype (non-sports shelves). */
const HYPE_KEYWORD_PATTERNS: RegExp[] = [
  ...SPORTS_PROGRAMME_PATTERNS,
  /\b90 day\b/i,
  /\blove island\b/i,
  /\bbachelor\b/i,
  /\bfinale\b/i,
  /\blive\b/i,
  /\bdebate\b/i,
  /\bpay[- ]?per[- ]?view\b/i,
  /\bppv\b/i,
];

export type ScoredLiveEntry = {
  stream: LiveStream;
  programmeTitle: string;
  score: number;
  /** Optional second line (e.g. starts at 8:00 PM). */
  detail?: string;
};

function keywordBoost(text: string): number {
  let boost = 0;
  for (const re of HYPE_KEYWORD_PATTERNS) {
    if (re.test(text)) boost += 6;
  }
  return Math.min(boost, 24);
}

function networkBoost(channelName: string): number {
  const meta = parseChannelMeta(channelName);
  const net = meta.network?.toUpperCase();
  if (!net) return 0;
  if (MAJOR_NETWORKS.has(net)) return 14;
  for (const major of MAJOR_NETWORKS) {
    if (net.includes(major) || channelName.toUpperCase().includes(major)) {
      return 10;
    }
  }
  return 0;
}

function personalBoost(
  streamId: number,
  recentIds: Set<number>,
  favIds: Set<number>
): number {
  let s = 0;
  if (favIds.has(streamId)) s += 14;
  if (recentIds.has(streamId)) s += 10;
  return s;
}

export function scoreOnNowEntry(
  stream: LiveStream,
  nowTitle: string,
  recentIds: Set<number>,
  favIds: Set<number>
): number {
  let score = 50;
  score += networkBoost(stream.name);
  score += keywordBoost(nowTitle);
  score += keywordBoost(stream.name);
  score += personalBoost(stream.stream_id, recentIds, favIds);
  return score;
}

export function scoreTonightEntry(
  stream: LiveStream,
  tonight: TonightProgram,
  recentIds: Set<number>,
  favIds: Set<number>,
  nowSec: number
): number {
  let score = 35;
  score += networkBoost(stream.name);
  score += keywordBoost(tonight.title);
  score += keywordBoost(stream.name);
  score += personalBoost(stream.stream_id, recentIds, favIds);
  const hoursUntil =
    tonight.startSec > nowSec ? (tonight.startSec - nowSec) / 3600 : 0;
  if (hoursUntil > 0 && hoursUntil < 2) score += 12;
  return score;
}

export function formatTonightDetail(
  tonight: TonightProgram,
  nowSec: number
): string | undefined {
  if (tonight.startSec <= nowSec) return undefined;
  const d = new Date(tonight.startSec * 1000);
  const label = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Starts ${label}`;
}

/** Minimum items before showing a discovery live shelf. */
export const LIVE_DISCOVERY_MIN_ITEMS = 3;

/** Max channels to short-EPG scan per page load. */
export const LIVE_DISCOVERY_MAX_SCAN = 36;

export const LIVE_DISCOVERY_EPG_CONCURRENCY = 6;
