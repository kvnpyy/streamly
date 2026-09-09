/** Default manifest HTTP wait for initial transcode (ms). */
export const VOD_TRANSCODE_MANIFEST_HTTP_WAIT_MS = 16_000;

/** Max wait while ffmpeg produces the first playlist (ms) — background job only. */
export const VOD_TRANSCODE_PLAYLIST_WAIT_MS = 120_000;

/**
 * Never hold the HTTP request this long. Cloudflare 524s at ~100s; a held
 * `/api/stream` seek (e.g. tc_seek=2914) froze the player. Return 503 and let
 * hls.js / the client poll — ffmpeg keeps encoding either way.
 */
export const VOD_TRANSCODE_MANIFEST_MAX_HOLD_MS = 20_000;

/**
 * How long one playlist GET may block waiting for the first segment.
 * Mid-file `tc_seek` used to wait 120s and Cloudflare killed it with 524.
 */
export function transcodeManifestWaitMs(
  _seekSec: number,
  opts?: {
    httpWaitMs?: number;
    playlistWaitMs?: number;
  }
): number {
  const http = opts?.httpWaitMs ?? VOD_TRANSCODE_MANIFEST_HTTP_WAIT_MS;
  const cap = Math.min(
    opts?.playlistWaitMs ?? VOD_TRANSCODE_MANIFEST_MAX_HOLD_MS,
    VOD_TRANSCODE_MANIFEST_MAX_HOLD_MS
  );
  return Math.max(3_000, Math.min(http, cap));
}
