import { parsePositiveRouteId } from "@/lib/utils";
import type { SeriesItem, VodStream } from "@/lib/xtream-types";

export function vodStreamByIdMap(streams: VodStream[]): Map<number, VodStream> {
  const map = new Map<number, VodStream>();
  for (const s of streams) map.set(s.stream_id, s);
  return map;
}

export function seriesItemByIdMap(streams: SeriesItem[]): Map<number, SeriesItem> {
  const map = new Map<number, SeriesItem>();
  for (const s of streams) {
    const id = parsePositiveRouteId(s.series_id);
    if (id != null) map.set(id, s);
  }
  return map;
}

export function materializeVodStreamIds(
  byId: Map<number, VodStream>,
  ids: number[],
  limit: number
): VodStream[] {
  if (!ids.length) return [];
  const out: VodStream[] = [];
  for (let i = 0; i < ids.length && out.length < limit; i++) {
    const s = byId.get(ids[i]!);
    if (s) out.push(s);
  }
  return out;
}

export function materializeSeriesIds(
  byId: Map<number, SeriesItem>,
  ids: number[],
  limit: number
): SeriesItem[] {
  if (!ids.length) return [];
  const out: SeriesItem[] = [];
  for (let i = 0; i < ids.length && out.length < limit; i++) {
    const s = byId.get(ids[i]!);
    if (s) out.push(s);
  }
  return out;
}
