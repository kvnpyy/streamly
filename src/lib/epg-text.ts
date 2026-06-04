import {
  type EpgListingLike,
  epgProgramRangeUnixSec,
} from "@/lib/epg-time";

/** Decode IPTV EPG titles (provider often base64-encodes them). */
export function decodeEpgText(s: string | undefined | null): string {
  if (!s) return "";
  if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.length % 4 === 0 && s.length > 8) {
    try {
      const decoded =
        typeof atob !== "undefined"
          ? decodeURIComponent(escape(atob(s)))
          : Buffer.from(s, "base64").toString("utf-8");
      const printable = decoded.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "");
      if (printable.length / decoded.length > 0.85) return decoded;
    } catch {
      /* not base64 */
    }
  }
  return s;
}

/** Resolve current programme title from Xtream-style listings. */
export function nowPlayingTitleFromListings(
  listings: EpgListingLike[],
  nowUnixSec: number
): string | undefined {
  let current = listings.find((p) => {
    const r = epgProgramRangeUnixSec(p);
    return r !== null && r.start <= nowUnixSec && nowUnixSec < r.end;
  });
  if (!current) {
    current = listings.find(
      (p) => Number((p as { now_playing?: unknown }).now_playing) === 1
    );
  }
  const raw = (current as { title?: string } | undefined)?.title;
  return raw ? decodeEpgText(raw) : undefined;
}
