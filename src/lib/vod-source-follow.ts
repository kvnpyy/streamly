import fsp from "fs/promises";
import type { Writable } from "stream";

const FOLLOW_CHUNK_BYTES = 1 << 20;

/**
 * Only containers that ffmpeg can demux front to back without seeking.
 * MP4/MOV keep their index at the end and need a seekable file.
 */
export function sourceCanStreamFromPipe(upstream: string): boolean {
  let pathname = upstream;
  try {
    pathname = new URL(upstream).pathname;
  } catch {
    /* plain path */
  }
  return /\.(mkv|webm|ts|m2ts|mts)$/i.test(pathname.trim());
}

export type FollowSourceState = {
  /** True once the download has finished; the open file will not grow again. */
  complete: boolean;
  /** Bytes the downloader reports. Smaller than what we read means it restarted. */
  bytes: number;
};

/**
 * Copy a file that is still being downloaded into `out`, waiting at the end
 * for more bytes instead of stopping. ffmpeg reading the partial file directly
 * hits end-of-file whenever it catches up with the download, exits, and the
 * restart leaves a timestamp break in the episode.
 *
 * Ends `out` once the download is complete and fully copied, when the source
 * stops growing for `stallMs`, or when `signal` aborts.
 */
export async function followGrowingFile(opts: {
  filePath: string;
  out: Writable;
  state: () => Promise<FollowSourceState | null>;
  waitForGrowth: (afterBytes: number) => Promise<void>;
  signal?: AbortSignal;
  stallMs?: number;
  onBytes?: () => void;
}): Promise<{ bytes: number; reason: "complete" | "stalled" | "aborted" | "error" }> {
  const stallMs = opts.stallMs ?? 120_000;
  const fh = await fsp.open(opts.filePath, "r");
  const buf = Buffer.allocUnsafe(FOLLOW_CHUNK_BYTES);
  let pos = 0;
  let lastGrowthAt = Date.now();
  let outClosed = false;
  const onOutGone = () => {
    outClosed = true;
  };
  opts.out.once("close", onOutGone);
  opts.out.once("error", onOutGone);

  const finish = (reason: "complete" | "stalled" | "aborted" | "error") => {
    if (!outClosed) opts.out.end();
    return { bytes: pos, reason };
  };

  try {
    for (;;) {
      if (opts.signal?.aborted) return finish("aborted");
      if (outClosed) return { bytes: pos, reason: "aborted" as const };

      const { bytesRead } = await fh.read(buf, 0, buf.length, pos);
      if (bytesRead > 0) {
        pos += bytesRead;
        lastGrowthAt = Date.now();
        opts.onBytes?.();
        const chunk = Buffer.from(buf.subarray(0, bytesRead));
        if (!opts.out.write(chunk)) {
          await new Promise<void>((resolve) => {
            const done = () => {
              opts.out.off("drain", done);
              opts.out.off("close", done);
              resolve();
            };
            opts.out.on("drain", done);
            opts.out.on("close", done);
          });
        }
        continue;
      }

      const st = await opts.state();
      if (!st) return finish("error");
      if (st.complete) {
        const size = (await fh.stat()).size;
        if (pos >= size) return finish("complete");
        continue;
      }
      if (st.bytes < pos) return finish("error");
      if (Date.now() - lastGrowthAt >= stallMs) return finish("stalled");
      await opts.waitForGrowth(pos);
      // The downloader can report growth on a replaced file that our handle
      // never sees; do not spin on it.
      await new Promise((r) => setTimeout(r, 100));
    }
  } catch {
    return finish("error");
  } finally {
    opts.out.off("close", onOutGone);
    opts.out.off("error", onOutGone);
    await fh.close().catch(() => {});
  }
}
