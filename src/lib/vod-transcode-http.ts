/** Still-encoding / gateway timeout — encode is running; client should poll. */
const RETRYABLE_VOD_TRANSCODE_HTTP = new Set([503, 504, 524]);

/** 524 is Cloudflare’s “origin took too long” — treat like 503, not a hard fail. */
export function isRetryableVodTranscodeHttpStatus(status: number): boolean {
  return RETRYABLE_VOD_TRANSCODE_HTTP.has(status);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export type VodTranscodePlaylistWaitResult = "ready" | "failed" | "aborted";

/**
 * Poll a transcode playlist until ffmpeg has a first segment (or we give up).
 * Used so a mid-file `tc_seek` does not tear down the current player first.
 */
export async function waitForVodTranscodePlaylistReady(
  url: string,
  opts?: { signal?: AbortSignal; deadlineMs?: number; pollMs?: number }
): Promise<VodTranscodePlaylistWaitResult> {
  const deadline = Date.now() + (opts?.deadlineMs ?? 180_000);
  const pollMs = opts?.pollMs ?? 1_500;
  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) return "aborted";
    try {
      const res = await fetch(url, {
        credentials: "same-origin",
        cache: "no-store",
        signal: opts?.signal,
      });
      if (res.ok) return "ready";
      if (
        !isRetryableVodTranscodeHttpStatus(res.status) &&
        res.status !== 502
      ) {
        return "failed";
      }
    } catch {
      if (opts?.signal?.aborted) return "aborted";
    }
    try {
      await sleep(pollMs, opts?.signal);
    } catch {
      return "aborted";
    }
  }
  return "failed";
}
