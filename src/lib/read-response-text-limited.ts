/**
 * Cap Response body reads so route handlers never call unbounded `.text()` /
 * `.arrayBuffer()` on hostile or misclassified upstream payloads (can throw
 * `RangeError: Invalid string length` or OOM the Node process).
 */

/** HLS playlists are text; even huge live windows stay well under a few MiB. */
export const MAX_HLS_MANIFEST_BYTES = 4 * 1024 * 1024;

/** VOD probe only needs the first ~16 bytes; keep a small ceiling if Range is ignored. */
export const MAX_VOD_PROBE_BYTES = 64 * 1024;

export class ResponseBodyTooLargeError extends Error {
  readonly maxBytes: number;

  constructor(maxBytes: number) {
    super(`Response body exceeds ${maxBytes} bytes`);
    this.name = "ResponseBodyTooLargeError";
    this.maxBytes = maxBytes;
  }
}

function contentLengthExceeds(res: Response, maxBytes: number): boolean {
  const raw = res.headers.get("content-length");
  if (!raw) return false;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > maxBytes;
}

async function cancelBody(res: Response): Promise<void> {
  try {
    await res.body?.cancel();
  } catch {
    /* ignore */
  }
}

/**
 * Read up to `maxBytes` from `res` as a UTF-8 string.
 * Rejects early when Content-Length exceeds the cap; otherwise streams and
 * aborts once the cumulative size would exceed it.
 */
export async function readResponseTextLimited(
  res: Response,
  maxBytes: number
): Promise<string> {
  const buf = await readResponseBytesLimited(res, maxBytes);
  return new TextDecoder("utf-8").decode(buf);
}

/**
 * Read up to `maxBytes` from `res` as a single Uint8Array.
 */
export async function readResponseBytesLimited(
  res: Response,
  maxBytes: number
): Promise<Uint8Array> {
  if (maxBytes <= 0) {
    await cancelBody(res);
    throw new ResponseBodyTooLargeError(maxBytes);
  }

  if (contentLengthExceeds(res, maxBytes)) {
    await cancelBody(res);
    throw new ResponseBodyTooLargeError(maxBytes);
  }

  if (!res.body) {
    return new Uint8Array(0);
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value?.byteLength) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new ResponseBodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } catch (err) {
    if (!(err instanceof ResponseBodyTooLargeError)) {
      await reader.cancel().catch(() => {});
    }
    throw err;
  }

  if (chunks.length === 0) return new Uint8Array(0);
  if (chunks.length === 1) return chunks[0]!;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
