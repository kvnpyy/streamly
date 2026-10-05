/**
 * Some live CDNs answer `{"message":"revoked"}` for every segment except the
 * newest few. hls.js then walks the whole sliding window (one fast 403 per
 * segment) and the channel never buffers. After we see that response, later
 * media playlists for the same host keep only the live edge.
 */

const HOST_TTL_MS = 10 * 60_000;
const hosts = new Map<string, number>();

export const REVOKED_EDGE_SEGMENT_COUNT = 3;

export function resetRevokedSegmentHostsForTests(): void {
  hosts.clear();
}

export function isRevokedTokenPayload(body: string): boolean {
  const text = body.trim();
  if (!text.startsWith("{") || text.length > 256) return false;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") return false;
    return (parsed as { message?: unknown }).message === "revoked";
  } catch {
    return false;
  }
}

/** @returns true the first time this host is marked (or after the mark expires). */
export function noteRevokedSegmentHost(host: string, now = Date.now()): boolean {
  const key = host.trim().toLowerCase();
  if (!key) return false;
  const prev = hosts.get(key);
  const fresh = prev == null || prev <= now;
  hosts.set(key, now + HOST_TTL_MS);
  if (fresh) {
    console.warn(
      JSON.stringify({
        severity: "warn",
        event: "stream_upstream_revoked",
        upstreamHost: key,
      })
    );
  }
  return fresh;
}

export function hostRevokesStaleSegments(host: string, now = Date.now()): boolean {
  const key = host.trim().toLowerCase();
  const exp = hosts.get(key);
  if (exp == null) return false;
  if (exp <= now) {
    hosts.delete(key);
    return false;
  }
  return true;
}

type Segment = { lines: string[] };

function isPlaylistHeaderTag(line: string): boolean {
  return /^(#EXTM3U\b|#EXT-X-VERSION:|#EXT-X-TARGETDURATION:|#EXT-X-MEDIA-SEQUENCE:|#EXT-X-DISCONTINUITY-SEQUENCE:|#EXT-X-PLAYLIST-TYPE:|#EXT-X-INDEPENDENT-SEGMENTS\b|#EXT-X-START:|#EXT-X-I-FRAMES-ONLY\b|#EXT-X-SERVER-CONTROL:)/i.test(
    line.trim()
  );
}

/**
 * Keep the last `keep` media segments of a live playlist and advance
 * EXT-X-MEDIA-SEQUENCE / EXT-X-DISCONTINUITY-SEQUENCE to match.
 * Masters, VOD (EXT-X-ENDLIST), and already-short playlists are unchanged.
 */
export function trimLiveMediaPlaylistToEdge(
  playlist: string,
  keep = REVOKED_EDGE_SEGMENT_COUNT
): string {
  if (keep < 1) return playlist;
  if (/#EXT-X-STREAM-INF:/i.test(playlist)) return playlist;
  if (/#EXT-X-ENDLIST/i.test(playlist)) return playlist;
  if (!/#EXTINF:/i.test(playlist)) return playlist;

  const lines = playlist.split(/\r?\n/);
  const header: string[] = [];
  const segments: Segment[] = [];
  let buf: string[] = [];
  let inHeader = true;

  for (const line of lines) {
    const trimmed = line.trim();
    if (inHeader && (trimmed === "" || isPlaylistHeaderTag(trimmed))) {
      header.push(line);
      continue;
    }
    inHeader = false;
    if (trimmed === "" || trimmed.startsWith("#")) {
      buf.push(line);
      continue;
    }
    buf.push(line);
    segments.push({ lines: buf });
    buf = [];
  }

  if (segments.length <= keep) return playlist;

  const dropped = segments.slice(0, segments.length - keep);
  const kept = segments.slice(-keep).map((seg) => ({ lines: [...seg.lines] }));

  let carriedKey: string | null = null;
  let droppedDiscontinuities = 0;
  for (const seg of dropped) {
    for (const line of seg.lines) {
      const trimmed = line.trim();
      if (/^#EXT-X-KEY:/i.test(trimmed)) carriedKey = line;
      if (/^#EXT-X-DISCONTINUITY$/i.test(trimmed)) droppedDiscontinuities += 1;
    }
  }

  const firstKeptHasKey = kept[0]!.lines.some((line) =>
    /^#EXT-X-KEY:/i.test(line.trim())
  );
  if (carriedKey && !firstKeptHasKey) {
    kept[0]!.lines.unshift(carriedKey);
  }

  const headerOut = header.map((line) => {
    const seq = line.match(/^(#EXT-X-MEDIA-SEQUENCE:)(\d+)\s*$/i);
    if (!seq) return line;
    return `${seq[1]}${Number(seq[2]) + dropped.length}`;
  });

  if (droppedDiscontinuities > 0) {
    let found = false;
    for (let i = 0; i < headerOut.length; i++) {
      const tag = headerOut[i]!.match(
        /^(#EXT-X-DISCONTINUITY-SEQUENCE:)(\d+)\s*$/i
      );
      if (!tag) continue;
      headerOut[i] = `${tag[1]}${Number(tag[2]) + droppedDiscontinuities}`;
      found = true;
    }
    if (!found) {
      headerOut.push(`#EXT-X-DISCONTINUITY-SEQUENCE:${droppedDiscontinuities}`);
    }
  }

  return [...headerOut, ...kept.flatMap((seg) => seg.lines), ...buf].join("\n");
}
