import { parseChannelMeta } from "@/lib/channel-meta";
import type { LiveStream } from "@/lib/xtream-types";
import type { Favorite, RecentItem } from "@/store/preferences";
import { LIVE_DISCOVERY_MAX_SCAN } from "@/lib/discovery/live-scoring";

function networkRank(name: string): number {
  const meta = parseChannelMeta(name);
  return meta.network ? 1 : 0;
}

/**
 * Pick stream IDs to scan for discovery shelves — favorites and recents first,
 * then major-network channels, then the rest (capped).
 */
export function pickLiveDiscoveryCandidateIds(
  channels: LiveStream[],
  recents: RecentItem[],
  favorites: Favorite[],
  maxScan = LIVE_DISCOVERY_MAX_SCAN,
  priorityIds: number[] = []
): number[] {
  const byId = new Map(channels.map((c) => [c.stream_id, c]));
  const ordered: number[] = [];
  const seen = new Set<number>();

  const push = (id: number) => {
    if (seen.has(id) || !byId.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  for (const id of priorityIds) {
    push(id);
  }

  for (const r of recents.filter((x) => x.kind === "live")) {
    push(r.id);
  }
  for (const f of favorites.filter((x) => x.kind === "live")) {
    push(f.id);
  }

  const rest = channels
    .filter((c) => !seen.has(c.stream_id))
    .slice()
    .sort((a, b) => {
      const nr = networkRank(b.name) - networkRank(a.name);
      if (nr !== 0) return nr;
      return a.name.localeCompare(b.name);
    });

  for (const c of rest) {
    push(c.stream_id);
    if (ordered.length >= maxScan) break;
  }

  return ordered.slice(0, maxScan);
}
