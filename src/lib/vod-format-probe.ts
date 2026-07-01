import { buildDirectSourceProxyUrl, buildStreamUrl } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { looksLikeHtmlContentType } from "@/lib/vod-stream-probe-server";
import {
  isVodTranscodeEnabledClient,
  vodContainerNeedsServerPrep,
} from "@/lib/vod-transcode-url";
import { normalizeContainerExt, vodContainerUiHint } from "@/lib/utils";

/** Browser-friendly extensions to try before falling back to MKV/AVI. */
const PREFERRED_VOD_EXTS = ["mp4", "m4v", "mov", "ts"] as const;

/** Only MP4 is probed — extra extensions were exhausting single-connection panels. */
export const VOD_FORMAT_PROBE_EXTS = ["mp4"] as const;

const PROBE_TIMEOUT_MS = 4500;
const PROBE_CACHE_MS = 30 * 60_000;
/** Pause between extension probes so single-connection panels can release the slot. */
export const VOD_FORMAT_PROBE_GAP_MS = 700;
/** Cooldown after any probe attempt before opening the declared MKV/AVI stream. */
export const VOD_FORMAT_PROBE_FALLBACK_COOLDOWN_MS = 1_200;

const probeCache = new Map<
  string,
  { ext: string; proxyUrl: string; at: number }
>();

export type VodPlayKind = "movie" | "series";

export type VodProbeResult = "hit" | "miss" | "busy";

export function extFromHttpUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0].toLowerCase();
  const m = path.match(/\.([a-z0-9]{2,5})$/);
  return m ? m[1]! : null;
}

export function isProbeUpstreamBusyStatus(status: number): boolean {
  return (
    status === 409 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 551
  );
}

/** Ordered playback extensions: prefer MP4-family when metadata is risky/unknown. */
export function vodAlternateExtensionCandidates(
  declaredExt: string | undefined | null
): string[] {
  const declared = normalizeContainerExt(declaredExt);
  if (declared === "mp4" || declared === "m4v") return [declared];
  if (vodContainerUiHint(declared) !== "risky" && declared !== "unknown") {
    return [declared];
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (ext: string) => {
    const n = normalizeContainerExt(ext);
    if (n === "unknown" || seen.has(n)) return;
    seen.add(n);
    ordered.push(n);
  };

  for (const ext of PREFERRED_VOD_EXTS) add(ext);
  if (declared !== "unknown") add(declared);
  else add("mkv");
  return ordered;
}

/** Extensions to probe sequentially before using declared MKV/AVI (MP4 only). */
export function extensionsToProbe(
  candidates: string[],
  declaredExt: string | undefined | null
): string[] {
  const declared = normalizeContainerExt(declaredExt);
  if (declared === "mp4" || declared === "m4v") return [];
  if (vodContainerUiHint(declared) !== "risky" && declared !== "unknown") {
    return [];
  }
  return VOD_FORMAT_PROBE_EXTS.filter(
    (ext) => ext !== declared && candidates.includes(ext)
  );
}

function vodFormatProbeDisabled(): boolean {
  const v = process.env.NEXT_PUBLIC_VOD_FORMAT_PROBE?.trim();
  return v === "0" || v === "false";
}

/** Skip pre-play probes when server transcode will handle MKV or probing is disabled. */
export function shouldSkipVodFormatProbe(declaredExt: string | undefined | null): boolean {
  if (vodFormatProbeDisabled()) return true;
  const declared = normalizeContainerExt(declaredExt);
  if (isVodTranscodeEnabledClient() && vodContainerNeedsServerPrep(declared)) {
    return true;
  }
  return false;
}

function defaultVodFallbackExt(
  kind: VodPlayKind,
  declared: string
): string {
  if (declared !== "unknown") return declared;
  return kind === "series" ? "mkv" : "mp4";
}

function appendFormatProbeParam(proxyUrl: string): string {
  try {
    const parsed = new URL(proxyUrl, "http://localhost");
    parsed.searchParams.set("probe", "1");
    return `${parsed.pathname}?${parsed.searchParams.toString()}`;
  } catch {
    const join = proxyUrl.includes("?") ? "&" : "?";
    return `${proxyUrl}${join}probe=1`;
  }
}

function sleepMs(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort);
  });
}

/** Lightweight same-origin probe via `/api/stream?probe=1` (16-byte Range upstream). */
export async function probeVodProxyUrl(
  proxyUrl: string,
  signal?: AbortSignal
): Promise<VodProbeResult> {
  if (typeof window === "undefined") return "hit";

  const probeUrl = appendFormatProbeParam(proxyUrl);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const res = await fetch(probeUrl, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });

    if (res.status === 204) return "hit";
    if (res.status === 404 || res.status === 410 || res.status === 403) {
      return "miss";
    }
    if (isProbeUpstreamBusyStatus(res.status)) return "busy";
    const ct = res.headers.get("content-type") ?? "";
    if (looksLikeHtmlContentType(ct)) return "miss";
    if (res.ok || res.status === 206) return "hit";
    return "miss";
  } catch {
    return "busy";
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function clearVodFormatProbeCache(): void {
  probeCache.clear();
}

export type ResolveVodPlayTargetOpts = {
  declaredExt?: string | null;
  directSource?: string | null;
  signal?: AbortSignal;
  /** Tests / SSR — skip network probes. */
  skipProbe?: boolean;
  /** Override gap between extension probes (ms). */
  probeGapMs?: number;
  /** Override cooldown before fallback stream (ms). */
  probeFallbackCooldownMs?: number;
};

/**
 * Pick the best proxied VOD URL: `direct_source` first, then probe MP4 when the
 * panel says MKV, then fall back to declared extension.
 */
export async function resolveBestVodPlayTarget(
  creds: XtreamCredentials,
  kind: VodPlayKind,
  streamId: number,
  opts?: ResolveVodPlayTargetOpts
): Promise<{ proxyUrl: string; containerExt: string }> {
  let ds = opts?.directSource?.trim();
  if (ds?.startsWith("//")) ds = `https:${ds}`;
  if (ds && /^https?:\/\//i.test(ds)) {
    const proxyUrl = buildDirectSourceProxyUrl(ds);
    const fromUrl = extFromHttpUrl(ds);
    const declared = normalizeContainerExt(opts?.declaredExt);
    const containerExt =
      fromUrl ?? (declared === "unknown" ? "mp4" : declared);
    return { proxyUrl, containerExt };
  }

  const declared = normalizeContainerExt(opts?.declaredExt);
  if (typeof window === "undefined" || opts?.skipProbe) {
    const fallback = defaultVodFallbackExt(kind, declared);
    return {
      proxyUrl: buildStreamUrl(creds, kind, streamId, fallback),
      containerExt: fallback,
    };
  }

  const cacheKey = `${kind}:${streamId}:${declared}`;
  const cached = probeCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PROBE_CACHE_MS) {
    return { proxyUrl: cached.proxyUrl, containerExt: cached.ext };
  }

  if (declared === "mp4" || declared === "m4v") {
    const proxyUrl = buildStreamUrl(creds, kind, streamId, declared);
    return { proxyUrl, containerExt: declared };
  }

  if (shouldSkipVodFormatProbe(declared)) {
    const fallbackExt = defaultVodFallbackExt(kind, declared);
    return {
      proxyUrl: buildStreamUrl(creds, kind, streamId, fallbackExt),
      containerExt: fallbackExt,
    };
  }

  const candidates = vodAlternateExtensionCandidates(opts?.declaredExt);
  const toProbe = extensionsToProbe(candidates, opts?.declaredExt);
  const gapMs = opts?.probeGapMs ?? VOD_FORMAT_PROBE_GAP_MS;
  const fallbackCooldownMs =
    opts?.probeFallbackCooldownMs ?? VOD_FORMAT_PROBE_FALLBACK_COOLDOWN_MS;

  let probesAttempted = 0;
  let upstreamBusy = false;

  for (let i = 0; i < toProbe.length; i++) {
    const ext = toProbe[i]!;
    if (opts?.signal?.aborted) break;
    if (upstreamBusy) break;
    if (i > 0) {
      try {
        await sleepMs(gapMs, opts?.signal);
      } catch {
        break;
      }
    }
    const proxyUrl = buildStreamUrl(creds, kind, streamId, ext);
    const result = await probeVodProxyUrl(proxyUrl, opts?.signal);
    probesAttempted += 1;
    if (result === "hit") {
      probeCache.set(cacheKey, { ext, proxyUrl, at: Date.now() });
      return { proxyUrl, containerExt: ext };
    }
    if (result === "busy") {
      upstreamBusy = true;
      break;
    }
  }

  if (probesAttempted > 0) {
    try {
      await sleepMs(fallbackCooldownMs, opts?.signal);
    } catch {
      /* aborted */
    }
  }

  const fallbackExt = defaultVodFallbackExt(kind, declared);
  const proxyUrl = buildStreamUrl(creds, kind, streamId, fallbackExt);
  return { proxyUrl, containerExt: fallbackExt };
}

export async function resolveMoviePlayUrl(
  creds: XtreamCredentials,
  movie: {
    stream_id: number;
    container_extension?: string | null;
    direct_source?: string | null;
  },
  opts?: Omit<ResolveVodPlayTargetOpts, "declaredExt" | "directSource">
): Promise<{ proxyUrl: string; containerExt: string }> {
  return resolveBestVodPlayTarget(creds, "movie", movie.stream_id, {
    declaredExt: movie.container_extension,
    directSource: movie.direct_source,
    ...opts,
  });
}

export async function resolveSeriesEpisodePlayUrl(
  creds: XtreamCredentials,
  episode: {
    id: string;
    container_extension?: string | null;
    direct_source?: string | null;
  },
  opts?: Omit<ResolveVodPlayTargetOpts, "declaredExt" | "directSource">
): Promise<{ proxyUrl: string; containerExt: string }> {
  const streamId = parseInt(episode.id, 10);
  return resolveBestVodPlayTarget(creds, "series", streamId, {
    declaredExt: episode.container_extension,
    directSource: episode.direct_source,
    ...opts,
  });
}
