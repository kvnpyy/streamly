import { yieldToMain } from "@/lib/yield-to-main";
import type { LiveStream } from "@/lib/xtream-types";
import { resolveProviderMediaUrl } from "@/lib/image-proxy";

/** Hard cap — panels with 30k+ channels freeze the browser if merged in one tick. */
export const MAX_LIVE_CATALOG_STREAMS = 18_000;

const NORMALIZE_CHUNK = 1_500;

function extractLiveStreamsRows(raw: unknown): unknown[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "object") return [];
  const o = raw as Record<string, unknown>;
  const keys = [
    "streams",
    "live_streams",
    "channels",
    "available_channels",
    "data",
  ];
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const inner = v as Record<string, unknown>;
      if (Array.isArray(inner.streams)) return inner.streams;
      if (Array.isArray(inner.data)) return inner.data as unknown[];
    }
  }
  return [];
}

function normalizeLiveStreamRow(
  item: unknown,
  panelServer?: string
): LiveStream | null {
  if (!item || typeof item !== "object") return null;
  const r = item as Record<string, unknown>;
  const stream_id = Number(r.stream_id);
  if (!Number.isFinite(stream_id)) return null;
  const name =
    typeof r.name === "string"
      ? r.name
      : r.name != null
        ? String(r.name)
        : "";
  if (!name.trim()) return null;
  const category_id = r.category_id != null ? String(r.category_id) : "";
  return {
    num: Number(r.num) || 0,
    name,
    stream_type: "live",
    stream_id,
    stream_icon: panelServer
      ? resolveProviderMediaUrl(
          typeof r.stream_icon === "string" ? r.stream_icon : "",
          panelServer
        )
      : typeof r.stream_icon === "string"
        ? r.stream_icon
        : "",
    epg_channel_id:
      r.epg_channel_id != null ? String(r.epg_channel_id) : undefined,
    added:
      typeof r.added === "string" ? r.added : String(r.added ?? ""),
    is_adult: r.is_adult as LiveStream["is_adult"],
    category_id,
    category_ids: Array.isArray(r.category_ids)
      ? (r.category_ids as number[])
      : undefined,
    custom_sid:
      r.custom_sid === null || r.custom_sid === undefined
        ? r.custom_sid
        : String(r.custom_sid),
    tv_archive: (r.tv_archive ?? 0) as LiveStream["tv_archive"],
    direct_source:
      typeof r.direct_source === "string" ? r.direct_source : undefined,
    tv_archive_duration:
      r.tv_archive_duration as LiveStream["tv_archive_duration"],
  };
}

/** Sync path for tests and small payloads. */
export function normalizeLiveStreamsPayload(
  raw: unknown,
  panelServer?: string
): LiveStream[] {
  const rows = extractLiveStreamsRows(raw);
  const out: LiveStream[] = [];
  for (const item of rows) {
    const row = normalizeLiveStreamRow(item, panelServer);
    if (row) out.push(row);
  }
  return out;
}

export async function normalizeLiveStreamsPayloadAsync(
  raw: unknown,
  panelServer?: string,
  signal?: AbortSignal
): Promise<LiveStream[]> {
  const rows = extractLiveStreamsRows(raw);
  const out: LiveStream[] = [];
  for (let i = 0; i < rows.length; i += NORMALIZE_CHUNK) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const end = Math.min(i + NORMALIZE_CHUNK, rows.length);
    for (let j = i; j < end; j++) {
      const row = normalizeLiveStreamRow(rows[j], panelServer);
      if (row) out.push(row);
    }
    if (end < rows.length) await yieldToMain();
  }
  return out;
}

export async function dedupeLiveStreamsByIdAsync(
  rows: LiveStream[],
  signal?: AbortSignal
): Promise<LiveStream[]> {
  const seen = new Set<number>();
  const out: LiveStream[] = [];
  for (let i = 0; i < rows.length; i += NORMALIZE_CHUNK) {
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const end = Math.min(i + NORMALIZE_CHUNK, rows.length);
    for (let j = i; j < end; j++) {
      const row = rows[j]!;
      if (seen.has(row.stream_id)) continue;
      seen.add(row.stream_id);
      out.push(row);
    }
    if (end < rows.length) await yieldToMain();
  }
  return out;
}

export async function finalizeLiveCatalogAsync(
  rows: LiveStream[],
  signal?: AbortSignal
): Promise<LiveStream[]> {
  const deduped = await dedupeLiveStreamsByIdAsync(rows, signal);
  if (deduped.length <= MAX_LIVE_CATALOG_STREAMS) return deduped;
  return deduped.slice(0, MAX_LIVE_CATALOG_STREAMS);
}
