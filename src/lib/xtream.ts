import type {
  AuthResponse,
  Category,
  LiveStream,
  SeriesEpisode,
  SeriesInfo,
  SeriesItem,
  ShortEPG,
  VodInfo,
  VodStream,
  XtreamCredentials,
} from "./xtream-types";
import { isXtreamCatalogCacheAction } from "./xtream-catalog-cache";

/** Panels vary: listing array may sit under several keys or at the root. */
export function extractXtreamEpgPayload(raw: unknown): ShortEPG {
  if (raw == null || typeof raw !== "object") {
    return { epg_listings: [] };
  }
  if (Array.isArray(raw)) {
    return { epg_listings: raw as ShortEPG["epg_listings"] };
  }
  const r = raw as Record<string, unknown>;
  let list: unknown =
    r.epg_listings ??
    r.epgs ??
    r.epg ??
    r.listings ??
    r.programmes ??
    r.programmes_list;

  if (!Array.isArray(list) && r.data && typeof r.data === "object") {
    const d = r.data as Record<string, unknown>;
    list =
      d.epg_listings ??
      d.epgs ??
      d.listings ??
      list;
  }

  if (!Array.isArray(list) && list && typeof list === "object") {
    const inner = list as Record<string, unknown>;
    list =
      inner.epg_listings ??
      inner.listings ??
      inner.epgs ??
      inner.data;
  }

  if (!Array.isArray(list)) {
    return { epg_listings: [] };
  }
  return { epg_listings: list as ShortEPG["epg_listings"] };
}

/** Guess proxy mode from URL — PPV feeds sometimes ship direct MP4/MKV links. */
export function inferStreamProxyType(upstreamUrl: string): "hls" | "vod" {
  const path = upstreamUrl.split(/[?#]/)[0].toLowerCase();
  if (path.includes(".m3u8")) return "hls";
  if (/\.(mp4|mkv|avi|webm|mov)(\?|$)/i.test(path)) return "vod";
  return "hls";
}

/**
 * Live playback URL. Many event / PPV channels only work via `direct_source`
 * from the provider; the default …/live/…/id.m3u8 path is empty or invalid.
 */
export function buildLivePlayUrl(
  creds: XtreamCredentials,
  stream: Pick<LiveStream, "stream_id" | "direct_source">
): string {
  let ds = stream.direct_source?.trim();
  if (ds?.startsWith("//")) ds = `https:${ds}`;
  if (ds && /^https?:\/\//i.test(ds)) {
    const params = new URLSearchParams({
      u: ds,
      type: inferStreamProxyType(ds),
    });
    return `/api/stream?${params.toString()}`;
  }
  return buildStreamUrl(creds, "live", stream.stream_id);
}

/**
 * Series episode playback URL. Some panels expose a direct MP4/HLS link per
 * episode (same idea as live `direct_source`).
 */
export function buildSeriesEpisodePlayUrl(
  creds: XtreamCredentials,
  episode: Pick<SeriesEpisode, "id" | "direct_source" | "container_extension">
): string {
  let ds = episode.direct_source?.trim();
  if (ds?.startsWith("//")) ds = `https:${ds}`;
  if (ds && /^https?:\/\//i.test(ds)) {
    const params = new URLSearchParams({
      u: ds,
      type: inferStreamProxyType(ds),
    });
    return `/api/stream?${params.toString()}`;
  }
  const ext = episode.container_extension || "mkv";
  return buildStreamUrl(creds, "series", parseInt(episode.id, 10), ext);
}

/**
 * Panels differ: some omit `info`, nest metadata at top level, or return episodic data only.
 * Normalizing avoids React crashes and useless "couldn't load" when episodes exist.
 */
function normalizeSeriesInfoResponse(raw: unknown, seriesId: number): SeriesInfo {
  if (raw === null || typeof raw !== "object") {
    throw new Error("Series API returned empty or invalid JSON.");
  }
  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return {
        seasons: [],
        info: { name: `Series ${seriesId}`, cover: "" },
        episodes: {},
      };
    }
    throw new Error(
      "Series API returned an unexpected list instead of series details."
    );
  }
  const r = raw as Record<string, unknown>;

  const ui = r.user_info;
  if (ui && typeof ui === "object") {
    const auth = (ui as Record<string, unknown>).auth;
    if (auth === 0 || auth === "0") {
      throw new Error(
        "Your provider rejected this request (session/auth). Sign out and sign in again."
      );
    }
  }

  const episodes: Record<string, SeriesEpisode[]> = {};
  const epRaw = r.episodes;
  if (epRaw && typeof epRaw === "object" && !Array.isArray(epRaw)) {
    for (const [seasonKey, list] of Object.entries(epRaw)) {
      if (Array.isArray(list)) episodes[seasonKey] = list as SeriesEpisode[];
    }
  }

  let info = r.info;
  if (!info || typeof info !== "object") {
    const name =
      typeof r.name === "string"
        ? r.name
        : typeof r.series_name === "string"
          ? r.series_name
          : typeof r.title === "string"
            ? r.title
            : `Series ${seriesId}`;
    const cover =
      typeof r.cover === "string"
        ? r.cover
        : typeof r.cover_big === "string"
          ? r.cover_big
          : typeof r.movie_image === "string"
            ? r.movie_image
            : "";
    info = {
      name,
      cover,
      plot: typeof r.plot === "string" ? r.plot : undefined,
      cast: typeof r.cast === "string" ? r.cast : undefined,
      director: typeof r.director === "string" ? r.director : undefined,
      genre: typeof r.genre === "string" ? r.genre : undefined,
      releaseDate:
        typeof r.releaseDate === "string"
          ? r.releaseDate
          : typeof r.release_date === "string"
            ? r.release_date
            : undefined,
      release_date:
        typeof r.release_date === "string"
          ? r.release_date
          : typeof r.releaseDate === "string"
            ? r.releaseDate
            : undefined,
      rating: typeof r.rating === "string" ? r.rating : undefined,
      backdrop_path: Array.isArray(r.backdrop_path)
        ? (r.backdrop_path as string[])
        : undefined,
      youtube_trailer:
        typeof r.youtube_trailer === "string" ? r.youtube_trailer : undefined,
      episode_run_time:
        typeof r.episode_run_time === "string" ? r.episode_run_time : undefined,
      category_id:
        typeof r.category_id === "string" ? r.category_id : undefined,
    };
  }

  const seasons = Array.isArray(r.seasons)
    ? (r.seasons as SeriesInfo["seasons"])
    : [];

  return {
    seasons,
    info: info as SeriesInfo["info"],
    episodes,
  };
}

/** Talks to our local `/api/xtream` proxy (CORS-safe, creds in headers). */
async function call<T>(
  creds: XtreamCredentials,
  params: Record<string, string | number | undefined>,
  signal?: AbortSignal,
  opts?: { turnstileToken?: string | null }
): Promise<T> {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    qs.set(k, String(v));
  }
  const action =
    params.action !== undefined && params.action !== null && params.action !== ""
      ? String(params.action)
      : null;
  const headers: Record<string, string> = {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
  const tok = opts?.turnstileToken?.trim();
  if (tok) headers["x-turnstile-token"] = tok;

  const res = await fetch(`/api/xtream?${qs.toString()}`, {
    method: "GET",
    headers,
    signal,
    cache: isXtreamCatalogCacheAction(action) ? "default" : "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let msg = `IPTV request failed (${res.status}).`;
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j?.error === "string" && j.error.length > 0) {
        msg = j.error;
      }
    } catch {
      /* keep generic — avoids leaking raw upstream bodies into UI */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

/** Panels return arrays directly or nest them ({ streams, data, … }). */
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

/**
 * Normalize Xtream `get_live_streams` JSON into usable rows (handles wrappers +
 * loose number/string IDs).
 */
export function normalizeLiveStreamsPayload(raw: unknown): LiveStream[] {
  const rows = extractLiveStreamsRows(raw);
  const out: LiveStream[] = [];
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const stream_id = Number(r.stream_id);
    if (!Number.isFinite(stream_id)) continue;
    const name =
      typeof r.name === "string"
        ? r.name
        : r.name != null
          ? String(r.name)
          : "";
    if (!name.trim()) continue;
    const category_id =
      r.category_id != null ? String(r.category_id) : "";
    out.push({
      num: Number(r.num) || 0,
      name,
      stream_type: "live",
      stream_id,
      stream_icon:
        typeof r.stream_icon === "string" ? r.stream_icon : "",
      epg_channel_id:
        r.epg_channel_id != null ? String(r.epg_channel_id) : undefined,
      added:
        typeof r.added === "string"
          ? r.added
          : String(r.added ?? ""),
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
        typeof r.direct_source === "string"
          ? r.direct_source
          : undefined,
      tv_archive_duration: r.tv_archive_duration as LiveStream["tv_archive_duration"],
    });
  }
  return out;
}

function normalizeLiveCategoriesPayload(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  const out: Category[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const category_id =
      o.category_id != null ? String(o.category_id) : "";
    const category_name =
      typeof o.category_name === "string"
        ? o.category_name
        : String(o.category_name ?? "");
    if (!category_id && !category_name.trim()) continue;
    out.push({
      category_id,
      category_name,
      parent_id: Number(o.parent_id) || 0,
    });
  }
  return out;
}

function dedupeLiveStreamsById(rows: LiveStream[]): LiveStream[] {
  const seen = new Set<number>();
  const out: LiveStream[] = [];
  for (const row of rows) {
    if (seen.has(row.stream_id)) continue;
    seen.add(row.stream_id);
    out.push(row);
  }
  return out;
}

/**
 * Many panels return an empty list for `get_live_streams` without `category_id`.
 * If so, merge streams by fetching each live category (deduped by stream_id).
 */
async function fetchLiveStreamsCatalogMerged(
  c: XtreamCredentials,
  opts?: { prefetchedCategories?: Category[]; signal?: AbortSignal }
): Promise<LiveStream[]> {
  const signal = opts?.signal;
  const rawAll = await call<unknown>(
    c,
    { action: "get_live_streams" },
    signal
  );
  const direct = normalizeLiveStreamsPayload(rawAll);
  if (direct.length > 0) {
    return dedupeLiveStreamsById(direct);
  }
  const categories =
    opts?.prefetchedCategories && opts.prefetchedCategories.length > 0
      ? opts.prefetchedCategories
      : normalizeLiveCategoriesPayload(
          await call<unknown>(
            c,
            { action: "get_live_categories" },
            signal
          )
        );
  if (!categories.length) {
    return [];
  }
  const settled = await Promise.allSettled(
    categories.map((cat) =>
      call<unknown>(
        c,
        {
          action: "get_live_streams",
          category_id: cat.category_id,
        },
        signal
      ).then(normalizeLiveStreamsPayload)
    )
  );
  const merged: LiveStream[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") merged.push(...r.value);
  }
  return dedupeLiveStreamsById(merged);
}

export const xtream = {
  authenticate(
    c: XtreamCredentials,
    opts?: { signal?: AbortSignal; turnstileToken?: string | null }
  ) {
    return call<AuthResponse>(c, {}, opts?.signal, {
      turnstileToken: opts?.turnstileToken,
    });
  },
  liveCategories(c: XtreamCredentials, signal?: AbortSignal) {
    return call<Category[]>(c, { action: "get_live_categories" }, signal);
  },
  vodCategories(c: XtreamCredentials, signal?: AbortSignal) {
    return call<Category[]>(c, { action: "get_vod_categories" }, signal);
  },
  seriesCategories(c: XtreamCredentials, signal?: AbortSignal) {
    return call<Category[]>(c, { action: "get_series_categories" }, signal);
  },
  async liveStreams(
    c: XtreamCredentials,
    categoryId?: string,
    signal?: AbortSignal
  ): Promise<LiveStream[]> {
    const raw = await call<unknown>(
      c,
      { action: "get_live_streams", category_id: categoryId },
      signal
    );
    return normalizeLiveStreamsPayload(raw);
  },
  /** Full live catalogue: fast path without category_id, then per-category merge if empty. */
  liveStreamsAll(
    c: XtreamCredentials,
    opts?: { prefetchedCategories?: Category[]; signal?: AbortSignal }
  ): Promise<LiveStream[]> {
    return fetchLiveStreamsCatalogMerged(c, opts);
  },
  vodStreams(c: XtreamCredentials, categoryId?: string, signal?: AbortSignal) {
    return call<VodStream[]>(
      c,
      { action: "get_vod_streams", category_id: categoryId },
      signal
    );
  },
  series(c: XtreamCredentials, categoryId?: string, signal?: AbortSignal) {
    return call<SeriesItem[]>(
      c,
      { action: "get_series", category_id: categoryId },
      signal
    );
  },
  vodInfo(c: XtreamCredentials, vodId: number, signal?: AbortSignal) {
    return call<VodInfo>(c, { action: "get_vod_info", vod_id: vodId }, signal);
  },
  async seriesInfo(c: XtreamCredentials, seriesId: number, signal?: AbortSignal) {
    const raw = await call<unknown>(
      c,
      { action: "get_series_info", series_id: seriesId },
      signal
    );
    return normalizeSeriesInfoResponse(raw, seriesId);
  },
  async shortEPG(
    c: XtreamCredentials,
    streamId: number,
    limit = 6,
    signal?: AbortSignal
  ) {
    const raw = await call<unknown>(
      c,
      { action: "get_short_epg", stream_id: streamId, limit },
      signal
    );
    return extractXtreamEpgPayload(raw);
  },
  /**
   * Full per-channel EPG (often multi-day). Many providers populate this
   * even when get_short_epg returns empty, so we use it both as a fallback
   * for the channel tile and as the source for the Guide view.
   */
  async simpleDataTable(
    c: XtreamCredentials,
    streamId: number,
    signal?: AbortSignal
  ) {
    const raw = await call<unknown>(
      c,
      { action: "get_simple_data_table", stream_id: streamId },
      signal
    );
    return extractXtreamEpgPayload(raw);
  },
};

/**
 * Build a stream URL that goes through our proxy. The proxy supports HLS
 * manifest rewriting (so segment URLs also flow through the proxy) and Range
 * requests for seekable VOD content.
 */
export function buildStreamUrl(
  creds: XtreamCredentials,
  kind: "live" | "movie" | "series",
  streamId: number,
  ext?: string
): string {
  const path =
    kind === "live"
      ? `live/${creds.username}/${creds.password}/${streamId}.m3u8`
      : `${kind}/${creds.username}/${creds.password}/${streamId}.${ext || "mp4"}`;
  const upstream = `${creds.server.replace(/\/+$/, "")}/${path}`;
  const params = new URLSearchParams({
    u: upstream,
    type: kind === "live" ? "hls" : "vod",
  });
  return `/api/stream?${params.toString()}`;
}

export function buildImageProxy(url?: string | null): string | undefined {
  if (!url) return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;
  if (trimmed.startsWith("/api/img")) return trimmed;
  return `/api/img?u=${encodeURIComponent(trimmed)}`;
}
