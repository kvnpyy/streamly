import {
  appendVodTranscodeHls,
  canVodTranscodeProxyUrl,
  isVodTranscodeEnabledClient,
  playbackUrlUsesVodTranscode,
  vodNeedsServerTranscodePrep,
} from "@/lib/vod-transcode-url";
import type { PlayerSource } from "@/store/player";

export type CastStreamKind = "live" | "buffered";

export type CastMediaDescriptor = {
  url: string;
  contentType: string;
  streamType: CastStreamKind;
};

export function toAbsoluteAppUrl(origin: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = origin.replace(/\/+$/, "");
  return `${base}${pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`}`;
}

/** Tag proxied cast URLs so manifests can emit absolute segment URIs for receivers. */
export function appendCastStreamQuery(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set("cast", "1");
    return parsed.toString();
  } catch {
    const join = url.includes("?") ? "&" : "?";
    return `${url}${join}cast=1`;
  }
}

/**
 * Build a Chromecast-safe media URL: same-origin proxy (correct upstream UA),
 * HLS transcode for MKV/HEVC, never raw provider URLs.
 */
export function buildCastMediaDescriptor(opts: {
  origin: string;
  current: PlayerSource;
  isLive: boolean;
  /** Active browser playback URL (`current.url` or transcode override). */
  proxyPlaybackUrl: string;
}): CastMediaDescriptor | null {
  const { origin, current, isLive, proxyPlaybackUrl } = opts;
  if (!origin || !proxyPlaybackUrl) return null;

  let proxyPath = proxyPlaybackUrl;

  if (!isLive && isVodTranscodeEnabledClient()) {
    const needsTranscode =
      playbackUrlUsesVodTranscode(proxyPlaybackUrl) ||
      (vodNeedsServerTranscodePrep(current.containerExt, current.url) &&
        canVodTranscodeProxyUrl(current.url));
    if (needsTranscode) {
      proxyPath = playbackUrlUsesVodTranscode(proxyPlaybackUrl)
        ? proxyPlaybackUrl
        : appendVodTranscodeHls(current.url);
    }
  }

  const absolute = appendCastStreamQuery(
    toAbsoluteAppUrl(origin, proxyPath)
  );

  if (isLive) {
    return {
      url: absolute,
      contentType: "application/x-mpegURL",
      streamType: "live",
    };
  }

  const hls =
    playbackUrlUsesVodTranscode(proxyPath) ||
    /\.m3u8($|[?#])/i.test(proxyPath) ||
    current.containerExt?.toLowerCase() === "m3u8";

  if (hls) {
    return {
      url: absolute,
      contentType: "application/x-mpegURL",
      streamType: "buffered",
    };
  }

  const ext = (current.containerExt || "mp4").toLowerCase();
  const contentType =
    ext === "mkv"
      ? "video/x-matroska"
      : ext === "webm"
        ? "video/webm"
        : "video/mp4";

  return {
    url: absolute,
    contentType,
    streamType: "buffered",
  };
}
