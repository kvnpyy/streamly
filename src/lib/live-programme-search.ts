import {
  getBulkCachedEpgTitles,
  getCachedEpgKnownIds,
} from "@/lib/epg-local-cache";
import type { LiveChannelIndex } from "@/lib/live-channel-index";
import { sortLiveStreamsBySearchScore } from "@/lib/live-search-rank";
import {
  normalizeSearchText,
  textMatchesSearch,
} from "@/lib/search-normalize";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";

/** Rows per channel for on-air title lookup during live search. */
export const LIVE_SEARCH_EPG_LIMIT = 2;

/** Stable empty list for effect deps — `?? []` allocates a new array every render. */
export const EMPTY_PROGRAMME_SCAN_IDS: number[] = [];

export type LiveSearchScanPlan = {
  candidateIds: number[];
  truncated: boolean;
  nonNameMatchCount: number;
};

type ProgrammeSearchSource = LiveStream[] | LiveChannelIndex;

function programmeSearchRows(source: ProgrammeSearchSource): {
  streams: LiveStream[];
  nameLower: string[] | null;
} {
  if (Array.isArray(source)) {
    return { streams: source, nameLower: null };
  }
  return { streams: source.items, nameLower: source.nameLower };
}

/** One pass: channels that need an EPG fetch for programme-title matching. */
export function planLiveProgrammeSearch(
  source: ProgrammeSearchSource,
  queryLower: string,
  maxScan: number
): LiveSearchScanPlan {
  const { streams, nameLower } = programmeSearchRows(source);
  const candidateIds: number[] = [];
  let nonNameMatchCount = 0;

  const needle = normalizeSearchText(queryLower);
  for (let i = 0; i < streams.length; i++) {
    const s = streams[i]!;
    const nameMatch = nameLower
      ? textMatchesSearch(nameLower[i], needle)
      : textMatchesSearch(s.name, needle);
    if (nameMatch) continue;
    nonNameMatchCount += 1;
    if (candidateIds.length < maxScan) {
      candidateIds.push(s.stream_id);
    }
  }

  return {
    candidateIds,
    truncated: nonNameMatchCount > maxScan,
    nonNameMatchCount,
  };
}

function liveSearchProgrammeTitle(
  streamId: number,
  nowPlayingMap: Map<number, string>,
  programmeTitles: Map<number, string>
): string | undefined {
  return nowPlayingMap.get(streamId) ?? programmeTitles.get(streamId);
}

/** Name matches plus on-air / scanned programme-title matches, ranked for watch intent. */
export function mergeLiveSearchResults(
  nameMatched: LiveStream[],
  streams: LiveStream[],
  queryLower: string,
  nowPlayingMap: Map<number, string>,
  programmeTitles: Map<number, string>
): LiveStream[] {
  if (!queryLower) return streams;

  const needle = normalizeSearchText(queryLower);
  const out: LiveStream[] = [];
  const seen = new Set<number>();
  for (const s of nameMatched) {
    if (seen.has(s.stream_id)) continue;
    seen.add(s.stream_id);
    out.push(s);
  }
  for (const s of streams) {
    if (seen.has(s.stream_id)) continue;
    const np = liveSearchProgrammeTitle(
      s.stream_id,
      nowPlayingMap,
      programmeTitles
    );
    if (np && textMatchesSearch(np, needle)) {
      seen.add(s.stream_id);
      out.push(s);
    }
  }
  return sortLiveStreamsBySearchScore(out, needle, (s) =>
    liveSearchProgrammeTitle(s.stream_id, nowPlayingMap, programmeTitles)
  );
}

export type ProgrammeSearchCacheSeed = {
  hits: Map<number, string>;
  /** Stream IDs with a fresh cached on-air title (match or non-match). */
  knownIds: Set<number>;
};

export function seedProgrammeSearchFromCache(
  creds: XtreamCredentials,
  candidateIds: number[],
  queryLower: string
): ProgrammeSearchCacheSeed {
  const bulk = getBulkCachedEpgTitles(
    creds.server,
    creds.username,
    candidateIds
  );
  const knownIds = getCachedEpgKnownIds(
    creds.server,
    creds.username,
    candidateIds
  );
  const hits = new Map<number, string>();
  const needle = normalizeSearchText(queryLower);
  for (const [id, title] of bulk) {
    if (textMatchesSearch(title, needle)) hits.set(id, title);
  }
  return { hits, knownIds };
}

export function filterStreamsByLiveQuery(
  streams: LiveStream[],
  queryLower: string,
  nowPlayingMap: Map<number, string>,
  programmeTitles: Map<number, string>
): LiveStream[] {
  const needle = normalizeSearchText(queryLower);
  if (!needle) return streams;

  const out: LiveStream[] = [];
  for (const s of streams) {
    if (textMatchesSearch(s.name, needle)) {
      out.push(s);
      continue;
    }
    const np = liveSearchProgrammeTitle(
      s.stream_id,
      nowPlayingMap,
      programmeTitles
    );
    if (np && textMatchesSearch(np, needle)) out.push(s);
  }
  return sortLiveStreamsBySearchScore(out, needle, (s) =>
    liveSearchProgrammeTitle(s.stream_id, nowPlayingMap, programmeTitles)
  );
}
