import { buildDirectSourceProxyUrl, buildStreamUrl } from "@/lib/xtream";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { upstreamMediaExtFromProxyUrl } from "@/lib/vod-transcode-url";
import { normalizeContainerExt, vodContainerUiHint } from "@/lib/utils";

/** Extensions worth trying before falling back to panel-declared MKV/AVI. */
const PREFERRED_VOD_EXTS = ["mp4", "m4v", "mov", "ts"] as const;

const PROBE_TIMEOUT_MS = 4500;
const PROBE_CACHE_MS = 30 * 60_000;

const probeCache = new Map<
  string,
  { ext: string; proxyUrl: string; at: number }
>();

export type VodPlayKind = "movie" | "series";

export function extFromHttpUrl(url: string): string | null {
  const path = url.split(/[?#]/)[0].toLowerCase();
  const m = path.match(/\.([a-z0-9]{2,5})$/);
  return m ? m[1]! : null;
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

/** Extensions to HEAD-probe before using the declared risky container. */
export function extensionsToProbe(
  candidates: string[],
  declaredExt: string | undefined | null
): string[] {
  const declared = normalizeContainerExt(declaredExt);
  if (declared === "mp4" || declared === "m4v") return [];
  if (vodContainerUiHint(declared) !== "risky" && declared !== "unknown") {
    return [];
  }
  return candidates.filter((ext) => ext !== declared);
}

function defaultVodFallbackExt(
  kind: VodPlayKind,
  declared: string
): string {
  if (declared !== "unknown") return declared;
  return kind === "series" ? "mkv" : "mp4";
}

function looksLikeHtmlContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return ct.includes("text/html") || ct.includes("application/xhtml");
}

/** Lightweight same-origin probe via `/api/stream` (HEAD or tiny Range). */
export async function probeVodProxyUrl(
  proxyUrl: string,
  signal?: AbortSignal
): Promise<boolean> {
  if (typeof window === "undefined") return true;

  const ext = upstreamMediaExtFromProxyUrl(proxyUrl) ?? "mp4";
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener("abort", onAbort);
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const preferHead = ext === "mp4" || ext === "m4v" || ext === "mov";
    const res = await fetch(proxyUrl, {
      method: preferHead ? "HEAD" : "GET",
      ...(preferHead ? {} : { headers: { Range: "bytes=0-0" } }),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    });

    if (res.status === 404 || res.status === 410 || res.status === 403) {
      return false;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (looksLikeHtmlContentType(ct)) return false;
    return res.ok || res.status === 206;
  } catch {
    return false;
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
};

/**
 * Pick the best proxied VOD URL: `direct_source` first, then probe MP4/M4V when
 * the panel says MKV, then fall back to declared extension.
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

  const candidates = vodAlternateExtensionCandidates(opts?.declaredExt);
  for (const ext of extensionsToProbe(candidates, opts?.declaredExt)) {
    if (opts?.signal?.aborted) break;
    const proxyUrl = buildStreamUrl(creds, kind, streamId, ext);
    const ok = await probeVodProxyUrl(proxyUrl, opts?.signal);
    if (ok) {
      probeCache.set(cacheKey, { ext, proxyUrl, at: Date.now() });
      return { proxyUrl, containerExt: ext };
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
