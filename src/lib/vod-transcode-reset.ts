import { processSingleton } from "@/lib/process-singleton";

const MAX_RESET_TOKENS = 500;

/**
 * A Try again URL keeps `tc_reset` for the whole playback. hls.js reloads that
 * playlist every segment, and each reload used to kill ffmpeg. Honor each
 * token once so the encode restarts a single time.
 */
export function claimVodTranscodeResetIn(
  seen: Map<string, number>,
  key: string,
  token: string,
  now = Date.now()
): boolean {
  const trimmed = token.trim();
  if (!key || !trimmed) return false;
  const id = `${key}\0${trimmed}`;
  if (seen.has(id)) return false;
  seen.set(id, now);
  if (seen.size > MAX_RESET_TOKENS) {
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    for (const [seenKey, at] of seen) {
      if (at < oldestAt && seenKey !== id) {
        oldestAt = at;
        oldestKey = seenKey;
      }
    }
    if (oldestKey) seen.delete(oldestKey);
  }
  return true;
}

const honoredResetTokens = processSingleton(
  "vod-transcode:reset-tokens",
  () => new Map<string, number>()
);

export function claimVodTranscodeReset(
  key: string,
  token: string,
  now = Date.now()
): boolean {
  return claimVodTranscodeResetIn(honoredResetTokens, key, token, now);
}
