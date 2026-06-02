import { normalizeDiscoveryTitle } from "@/lib/discovery/normalize-title";
import type { CachedSportEvent } from "@/lib/discovery/sports-types";
import {
  channelLooksLikeSports,
  programmeLooksLikeSports,
} from "@/lib/discovery/sports-keywords";
import type { StreamEpgSnapshot } from "@/lib/discovery/live-epg";
import type { LiveStream } from "@/lib/xtream-types";

export type EventChannelMatch = {
  event: CachedSportEvent;
  stream: LiveStream;
  programmeTitle?: string;
  confidence: number;
};

function tokenOverlap(a: string, b: string): number {
  const ta = new Set(a.split(" ").filter((t) => t.length >= 3));
  const tb = new Set(b.split(" ").filter((t) => t.length >= 3));
  if (ta.size === 0 || tb.size === 0) return 0;
  let n = 0;
  for (const t of ta) {
    if (tb.has(t)) n++;
  }
  return n / Math.max(ta.size, tb.size);
}

function programmeMatchesEvent(
  programmeTitle: string,
  event: CachedSportEvent
): number {
  const normProg = normalizeDiscoveryTitle(programmeTitle);
  if (!normProg) return 0;

  let best = 0;
  for (const kw of event.keywords) {
    if (!kw) continue;
    if (normProg.includes(kw) || kw.includes(normProg)) {
      best = Math.max(best, 0.85);
      continue;
    }
    best = Math.max(best, tokenOverlap(normProg, kw));
  }

  const normEvent = normalizeDiscoveryTitle(event.title);
  if (normEvent && (normProg.includes(normEvent) || normEvent.includes(normProg))) {
    best = Math.max(best, 0.9);
  }
  return best;
}

const MATCH_THRESHOLD = 0.55;

/**
 * Match cached MMA events to channels using short-EPG programme titles.
 */
export function matchEventsToChannels(
  events: CachedSportEvent[],
  snapshots: Map<number, StreamEpgSnapshot>,
  channelById: Map<number, LiveStream>,
  limitPerEvent = 6
): EventChannelMatch[] {
  const results: EventChannelMatch[] = [];
  const used = new Set<string>();

  for (const event of events) {
    const matches: EventChannelMatch[] = [];

    for (const [streamId, snap] of snapshots) {
      const stream = channelById.get(streamId);
      if (!stream) continue;

      const titles = [snap.nowTitle, snap.tonight?.title].filter(Boolean) as string[];
      let confidence = 0;
      let programmeTitle: string | undefined;

      for (const t of titles) {
        const score = programmeMatchesEvent(t, event);
        if (score > confidence) {
          confidence = score;
          programmeTitle = t;
        }
      }

      if (confidence < MATCH_THRESHOLD && channelLooksLikeSports(stream.name)) {
        const blob = normalizeDiscoveryTitle(
          `${stream.name} ${snap.nowTitle || ""} ${event.title}`
        );
        if (event.keywords.some((kw) => blob.includes(kw))) {
          confidence = Math.max(confidence, 0.5);
          programmeTitle = programmeTitle || snap.nowTitle;
        }
      }

      if (confidence >= MATCH_THRESHOLD) {
        matches.push({
          event,
          stream,
          programmeTitle,
          confidence,
        });
      }
    }

    matches.sort((a, b) => b.confidence - a.confidence);
    for (const m of matches.slice(0, limitPerEvent)) {
      const key = `${m.event.id}:${m.stream.stream_id}`;
      if (used.has(key)) continue;
      used.add(key);
      results.push(m);
    }
  }

  return results.sort((a, b) => b.confidence - a.confidence);
}

export function buildSportsOnGuideEntries(
  snapshots: Map<number, StreamEpgSnapshot>,
  channelById: Map<number, LiveStream>,
  excludeStreamIds: Set<number>,
  limit = 24
): Array<{ stream: LiveStream; programmeTitle: string; score: number }> {
  const out: Array<{ stream: LiveStream; programmeTitle: string; score: number }> = [];

  for (const [streamId, snap] of snapshots) {
    if (excludeStreamIds.has(streamId)) continue;
    const stream = channelById.get(streamId);
    if (!stream) continue;
    const title = snap.nowTitle || snap.tonight?.title;
    if (!title) continue;
    if (!programmeLooksLikeSports(title) && !channelLooksLikeSports(stream.name)) {
      continue;
    }
    let score = 30;
    if (programmeLooksLikeSports(title)) score += 25;
    if (channelLooksLikeSports(stream.name)) score += 10;
    out.push({ stream, programmeTitle: title, score });
  }

  out.sort((a, b) => b.score - a.score);
  return out.slice(0, limit);
}
