import { resolveProviderMediaUrl } from "@/lib/image-proxy";

export type XtreamSidecarSubtitle = {
  label: string;
  lang?: string;
  url: string;
};

const URL_KEYS = [
  "url",
  "file",
  "path",
  "src",
  "subtitle_url",
  "sub_url",
  "link",
] as const;

const LABEL_KEYS = ["language", "lang", "label", "name", "title"] as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function firstString(
  rec: Record<string, unknown>,
  keys: readonly string[]
): string | undefined {
  for (const k of keys) {
    const v = rec[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function looksLikeSubtitleUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  if (/^https?:\/\//i.test(t) || t.startsWith("//") || t.startsWith("/")) {
    return (
      /\.(srt|vtt|webvtt)(\?|$)/i.test(t) ||
      /subtitle/i.test(t) ||
      /\/sub(?:s|title)?\//i.test(t)
    );
  }
  return /\.(srt|vtt|webvtt)(\?|$)/i.test(t);
}

function trackFromUnknown(
  value: unknown,
  fallbackLabel: string
): XtreamSidecarSubtitle | null {
  if (typeof value === "string" && looksLikeSubtitleUrl(value)) {
    return { label: fallbackLabel, url: value.trim() };
  }
  const rec = asRecord(value);
  if (!rec) return null;
  const url = firstString(rec, URL_KEYS);
  if (!url || !looksLikeSubtitleUrl(url)) return null;
  const label = firstString(rec, LABEL_KEYS) || fallbackLabel;
  const lang = firstString(rec, ["lang", "language", "iso", "code"]);
  return { label, lang, url };
}

function collectFromValue(
  value: unknown,
  out: XtreamSidecarSubtitle[]
): void {
  if (value == null) return;
  if (typeof value === "string") {
    const t = value.trim();
    if (!t) return;
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        collectFromValue(JSON.parse(t), out);
        return;
      } catch {
        /* not JSON */
      }
    }
    const one = trackFromUnknown(t, `Subtitle ${out.length + 1}`);
    if (one) out.push(one);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const one = trackFromUnknown(item, `Subtitle ${out.length + 1}`);
      if (one) out.push(one);
    }
    return;
  }
  const rec = asRecord(value);
  if (!rec) return;
  const one = trackFromUnknown(rec, `Subtitle ${out.length + 1}`);
  if (one) {
    out.push(one);
    return;
  }
  for (const nested of [
    rec.subtitles,
    rec.movie_subtitles,
    rec.subtitle,
    rec.subs,
    rec.available_subtitles,
  ]) {
    collectFromValue(nested, out);
  }
}

const PAYLOAD_KEYS = [
  "subtitles",
  "movie_subtitles",
  "subtitle",
  "subs",
  "available_subtitles",
] as const;

/** Pull sidecar SRT/VTT URLs from get_vod_info / get_series_info payloads. */
export function collectXtreamSidecarSubtitles(
  payload: unknown,
  panelServer: string
): XtreamSidecarSubtitle[] {
  const found: XtreamSidecarSubtitle[] = [];
  collectFromValue(payload, found);

  const rec = asRecord(payload);
  if (rec) {
    for (const k of PAYLOAD_KEYS) {
      collectFromValue(rec[k], found);
    }
    collectFromValue(rec.info, found);
    collectFromValue(rec.movie_data, found);
    collectFromValue(rec.movie_info, found);
  }

  const seen = new Set<string>();
  const out: XtreamSidecarSubtitle[] = [];
  for (const t of found) {
    const resolved = resolveProviderMediaUrl(t.url, panelServer);
    if (!resolved || !/^https?:\/\//i.test(resolved)) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    out.push({
      label: t.label.trim() || `Subtitle ${out.length + 1}`,
      lang: t.lang?.trim() || undefined,
      url: resolved,
    });
    if (out.length >= 8) break;
  }
  return out;
}

export function episodeFromSeriesInfo(
  payload: unknown,
  episodeStreamId: number
): unknown {
  const rec = asRecord(payload);
  if (!rec) return null;
  const episodes = rec.episodes;
  const needle = String(episodeStreamId);
  const visit = (item: unknown): unknown => {
    const e = asRecord(item);
    if (!e) return null;
    if (String(e.id ?? "") === needle) return e;
    if (String(e.stream_id ?? "") === needle) return e;
    return null;
  };
  if (Array.isArray(episodes)) {
    for (const item of episodes) {
      const hit = visit(item);
      if (hit) return hit;
    }
  } else {
    const map = asRecord(episodes);
    if (map) {
      for (const list of Object.values(map)) {
        if (!Array.isArray(list)) continue;
        for (const item of list) {
          const hit = visit(item);
          if (hit) return hit;
        }
      }
    }
  }
  return null;
}
