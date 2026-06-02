import type { EpgListingLike } from "@/lib/epg-time";
import { epgProgramRangeUnixSec } from "@/lib/epg-time";
import { decodeEpgText, nowPlayingTitleFromListings } from "@/lib/hooks";

/** Local wall-clock prime-time window for “Tonight” shelves (6:00 PM – 11:30 PM). */
export function localPrimeTimeWindowSec(nowSec: number): {
  start: number;
  end: number;
} {
  const now = new Date(nowSec * 1000);
  const start = new Date(now);
  start.setHours(18, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 30, 0, 0);
  return {
    start: Math.floor(start.getTime() / 1000),
    end: Math.floor(end.getTime() / 1000),
  };
}

export type TonightProgram = {
  title: string;
  startSec: number;
};

/**
 * Best programme overlapping local prime time — prefer on-air now, else next
 * starting within the window.
 */
export function tonightProgramFromListings(
  listings: EpgListingLike[],
  nowSec: number
): TonightProgram | undefined {
  const window = localPrimeTimeWindowSec(nowSec);
  let best: { title: string; startSec: number; score: number } | null = null;

  for (const p of listings) {
    const r = epgProgramRangeUnixSec(p);
    if (!r) continue;
    if (r.end <= window.start || r.start >= window.end) continue;

    const raw = (p as { title?: string }).title;
    const title = raw ? decodeEpgText(raw) : "";
    if (!title.trim()) continue;

    const airingNow = r.start <= nowSec && nowSec < r.end;
    const startsLater =
      r.start >= nowSec && r.start >= window.start && r.start < window.end;

    let score = 0;
    if (airingNow && nowSec >= window.start) score += 40;
    if (startsLater) {
      score += 30 - Math.min(20, (r.start - nowSec) / 1800);
    }
    if (airingNow && nowSec < window.start) score += 15;

    if (score <= 0) continue;
    if (!best || score > best.score) {
      best = { title, startSec: r.start, score };
    }
  }

  return best ? { title: best.title, startSec: best.startSec } : undefined;
}

export type StreamEpgSnapshot = {
  nowTitle?: string;
  tonight?: TonightProgram;
};

export function snapshotFromListings(
  listings: EpgListingLike[],
  nowSec: number
): StreamEpgSnapshot {
  const nowTitle = nowPlayingTitleFromListings(listings, nowSec);
  const tonight = tonightProgramFromListings(listings, nowSec);
  return {
    nowTitle,
    tonight: tonight ?? undefined,
  };
}
