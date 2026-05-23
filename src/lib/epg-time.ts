export type EpgListingLike = {
  start_timestamp?: string | number | null;
  stop_timestamp?: string | number | null;
  start?: string | null;
  end?: string | null;
};

/** Same slack as `LiveGuide` when deciding if provider rows cover the painted grid. */
export const GUIDE_VIEWPORT_PAD_SEC = 6 * 3600;

/** True if any listing overlaps [lo, hi) in unix seconds (guide window + pad). */
export function epgListingsOverlapWindow(
  listings: EpgListingLike[] | undefined | null,
  lo: number,
  hi: number
): boolean {
  if (!listings?.length) return false;
  return listings.some((p) => {
    const r = epgProgramRangeUnixSec(p);
    return r !== null && r.end > lo && r.start < hi;
  });
}

/**
 * Normalize Xtream-style programme timestamps to Unix **seconds**.
 * Most panels use seconds; some emit milliseconds — treating ms as seconds
 * breaks viewport filtering (everything falls outside the guide window).
 */
export function epgUnixSeconds(
  ts: string | number | undefined | null
): number | null {
  if (ts === undefined || ts === null) return null;
  let raw: number;
  if (typeof ts === "number") {
    raw = ts;
  } else {
    const str = String(ts).trim();
    if (!str) return null;
    raw = Number(str);
  }
  if (!Number.isFinite(raw)) return null;
  // Seconds ~1.7e9 (2024+); ms ~1.7e12
  if (raw > 10_000_000_000) return Math.floor(raw / 1000);
  return Math.floor(raw);
}

/** Panels sometimes ship human-readable `start` / `end` instead of unix fields. */
function epgParsePanelDate(value: string): number | null {
  const t = value.trim();
  if (!t) return null;
  let ms = Date.parse(t);
  if (!Number.isFinite(ms) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(t)) {
    ms = Date.parse(t.replace(" ", "T"));
  }
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

/** True if at least one row has parseable start/end (filters bogus provider payloads). */
export function epgListingsHaveParsableTimes(
  listings: EpgListingLike[] | undefined | null
): boolean {
  if (!listings?.length) return false;
  return listings.some((p) => epgProgramRangeUnixSec(p) !== null);
}

/** Best-effort programme bounds in Unix seconds (numeric + ISO-ish fallbacks). */
export function epgProgramRangeUnixSec(
  p: EpgListingLike
): { start: number; end: number } | null {
  let s = epgUnixSeconds(p.start_timestamp ?? null);
  let e = epgUnixSeconds(p.stop_timestamp ?? null);
  if (s === null && p.start) s = epgParsePanelDate(String(p.start));
  if (e === null && p.end) e = epgParsePanelDate(String(p.end));
  if (s === null || e === null) return null;
  if (e <= s) return null;
  return { start: s, end: e };
}
