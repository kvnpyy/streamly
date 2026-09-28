import {
  emptyVodMarkerDb,
  pruneVodMarkerDb,
  type VodMarkerDb,
} from "@/lib/vod-playback-markers";

const STORAGE_KEY = "iptv.vodMarkers.v1";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function loadVodMarkerDb(): VodMarkerDb {
  if (typeof window === "undefined") return emptyVodMarkerDb();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyVodMarkerDb();
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return emptyVodMarkerDb();
    const episodes = isRecord(parsed.episodes)
      ? (parsed.episodes as VodMarkerDb["episodes"])
      : {};
    const shows = isRecord(parsed.shows)
      ? (parsed.shows as VodMarkerDb["shows"])
      : {};
    return pruneVodMarkerDb({ episodes, shows });
  } catch {
    return emptyVodMarkerDb();
  }
}

export function saveVodMarkerDb(db: VodMarkerDb): void {
  if (typeof window === "undefined") return;
  try {
    const pruned = pruneVodMarkerDb(db);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
  } catch {
    /* private mode / quota */
  }
}
