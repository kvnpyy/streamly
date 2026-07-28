/**
 * Shared VOD-transcode seek policy (client + server).
 *
 * Growing HLS encodes must not spawn a new ffmpeg job every time playback
 * sits on the live tip — that forks writers and snaps the playhead to 0.
 */

/** How far past the encoded tip counts as an intentional scrub (server restart). */
export const TRANSCODE_SEEK_PAST_EDGE_SEC = 15;

/**
 * Bucket seek offsets so edge-recovery noise (3s / 13s / 23s) collapses to one job.
 * Exact 0 stays 0 (encode from start).
 */
export function quantizeTranscodeSeekSec(seekSec: number): number {
  const s = Math.max(0, Math.floor(Number(seekSec) || 0));
  if (s <= 0) return 0;
  return Math.floor(s / 60) * 60;
}

/**
 * Whether a scrub should restart the server encode (`tc_seek`) vs seeking in the
 * already-growing playlist.
 *
 * Strategy: one from-0 encode is the source of truth. Only fork a seek job for
 * large *forward* jumps past the encoded tip. Backward scrub into covered
 * segments is always an in-playlist seek.
 */
export function transcodeSeekNeedsServerRestart(opts: {
  absoluteSec: number;
  startOffsetSec: number;
  encodedSec: number;
}): boolean {
  const absolute = Math.max(0, opts.absoluteSec);
  const off = Math.max(0, opts.startOffsetSec);
  const encoded = Math.max(0, opts.encodedSec);
  const relative = absolute - off;

  // Before the current encode window — reload from-0 / earlier job.
  if (relative < -1) return true;

  if (encoded < 2) {
    // Encoded coverage unknown until headers arrive — never fork yet.
    return false;
  }

  // Still inside (or at) what is already encoded — normal scrub, including back.
  if (relative <= encoded + TRANSCODE_SEEK_PAST_EDGE_SEC) return false;

  // Large forward jump past the tip — temporary seek-fork accelerator.
  return true;
}

/**
 * True when an existing encode already covers (or is about to cover) `seekSec`,
 * so the server should reuse that job instead of starting a parallel one.
 */
export function shouldReuseTranscodeJobForSeek(opts: {
  jobStartOffsetSec: number;
  encodedSec: number;
  seekSec: number;
  procAlive: boolean;
  /** Seconds beyond encoded tip still considered "same growing job". */
  nearTipGraceSec?: number;
}): boolean {
  const seek = Math.max(0, Math.floor(opts.seekSec));
  const start = Math.max(0, Math.floor(opts.jobStartOffsetSec));
  if (start > seek) return false;

  const encoded = Math.max(0, opts.encodedSec);
  const coversThrough = start + encoded;
  if (coversThrough >= seek - 2) return true;

  const grace = opts.nearTipGraceSec ?? 45;
  if (start === 0 && opts.procAlive && seek <= coversThrough + grace) {
    return true;
  }

  return (
    quantizeTranscodeSeekSec(start) === quantizeTranscodeSeekSec(seek) &&
    (opts.procAlive || encoded > 0)
  );
}
