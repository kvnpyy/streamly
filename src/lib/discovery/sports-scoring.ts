import type { ScoredLiveEntry } from "@/lib/discovery/live-scoring";
import { scoreOnNowEntry } from "@/lib/discovery/live-scoring";
import type { CachedSportEvent } from "@/lib/discovery/sports-types";
import type { EventChannelMatch } from "@/lib/discovery/sports-match";
import type { LiveStream } from "@/lib/xtream-types";

export const SPORTS_SHELF_MIN_ITEMS = 3;

export function eventMatchesToScoredEntries(
  matches: EventChannelMatch[],
  recentIds: Set<number>,
  favIds: Set<number>,
  limit = 18
): ScoredLiveEntry[] {
  return matches.slice(0, limit).map((m) => {
    const base = m.programmeTitle
      ? scoreOnNowEntry(m.stream, m.programmeTitle, recentIds, favIds)
      : 40;
    const tierBoost = m.event.tier === "main" ? 18 : m.event.tier === "card" ? 10 : 4;
    return {
      stream: m.stream,
      programmeTitle: m.event.title,
      detail:
        formatEventShelfDetail(m.event) ||
        m.programmeTitle ||
        m.event.shortTitle,
      score: base + tierBoost + m.confidence * 20,
    };
  });
}

export function sportsGuideToScoredEntries(
  items: Array<{ stream: LiveStream; programmeTitle: string; score: number }>,
  recentIds: Set<number>,
  favIds: Set<number>
): ScoredLiveEntry[] {
  return items.map(({ stream, programmeTitle, score }) => ({
    stream,
    programmeTitle,
    score:
      score +
      scoreOnNowEntry(stream, programmeTitle, recentIds, favIds) * 0.35,
  }));
}

export function formatEventShelfDetail(event: CachedSportEvent): string | undefined {
  if (event.startsAt) {
    try {
      const d = new Date(event.startsAt);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString(undefined, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        });
      }
    } catch {
      /* noop */
    }
  }
  return event.date;
}
