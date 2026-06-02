import {
  buildNameSearchIndex,
  filterByNameQuery,
  type NameSearchIndex,
} from "@/lib/name-search-index";
import type { LiveStream } from "@/lib/xtream-types";

export type LiveChannelIndex = NameSearchIndex<LiveStream>;

export function buildLiveChannelIndex(streams: LiveStream[]): LiveChannelIndex {
  return buildNameSearchIndex(streams, (s) => s.name);
}

export function filterLiveChannelsByName(
  index: LiveChannelIndex,
  queryLower: string
): LiveStream[] {
  return filterByNameQuery(index, queryLower);
}
