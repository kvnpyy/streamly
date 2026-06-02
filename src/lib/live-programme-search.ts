import {
  getBulkCachedEpgTitles,
  getCachedEpgKnownIds,
} from "@/lib/epg-local-cache";
import type { LiveChannelIndex } from "@/lib/live-channel-index";
import { safeLower } from "@/lib/utils";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";

/** Rows per channel for on-air title lookup during live search. */
export const LIVE_SEARCH_EPG_LIMIT = 2;

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

  for (let i = 0; i < streams.length; i++) {
    const s = streams[i]!;
    const nameMatch = nameLower
      ? nameLower[i]!.includes(queryLower)
      : safeLower(s.name).includes(queryLower);
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

/** Name matches plus on-air / scanned programme-title matches (no duplicate name checks). */
export function mergeLiveSearchResults(
  nameMatched: LiveStream[],
  streams: LiveStream[],
  queryLower: string,
  nowPlayingMap: Map<number, string>,
  programmeTitles: Map<number, string>
): LiveStream[] {
  if (!queryLower) return streams;

  const out = nameMatched.slice();
  const seen = new Set(nameMatched.map((s) => s.stream_id));
  for (const s of streams) {
    if (seen.has(s.stream_id)) continue;
    const np =
      nowPlayingMap.get(s.stream_id) ?? programmeTitles.get(s.stream_id);
    if (np && np.toLowerCase().includes(queryLower)) out.push(s);
  }
  return out;
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
  const q = queryLower;
  for (const [id, title] of bulk) {
    if (title.toLowerCase().includes(q)) hits.set(id, title);
  }
  return { hits, knownIds };
}

export function filterStreamsByLiveQuery(
  streams: LiveStream[],
  queryLower: string,
  nowPlayingMap: Map<number, string>,
  programmeTitles: Map<number, string>
): LiveStream[] {
  if (!queryLower) return streams;

  const out: LiveStream[] = [];
  for (const s of streams) {
    if (safeLower(s.name).includes(queryLower)) {
      out.push(s);
      continue;
    }
    const np =
      nowPlayingMap.get(s.stream_id) ?? programmeTitles.get(s.stream_id);
    if (np && np.toLowerCase().includes(queryLower)) out.push(s);
  }
  return out;
}
