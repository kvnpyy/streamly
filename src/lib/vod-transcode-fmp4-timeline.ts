/**
 * Fragmented-MP4 timeline helpers.
 *
 * A resumed ffmpeg rebases each new process to time zero. Shifting the
 * segment clock forward puts those pieces back on the episode timeline.
 * A long run of video-only pieces is not a real join: the resume duplicated
 * silent frames, and the player freezes waiting for audio.
 */

const CONTAINER_TYPES = new Set([
  "moov",
  "trak",
  "mdia",
  "minf",
  "stbl",
  "moof",
  "traf",
]);

type Mp4Box = {
  start: number;
  size: number;
  type: string;
  header: number;
};

export function countTfdtBoxes(data: Buffer): number {
  let count = 0;
  let from = 0;
  while (from < data.length) {
    const at = data.indexOf("tfdt", from);
    if (at < 0) break;
    count += 1;
    from = at + 4;
  }
  return count;
}

export function initDeclaresAudio(init: Buffer): boolean {
  return init.includes(Buffer.from("soun"));
}

/**
 * Index of the first piece in a video-only run. One silent piece can be a
 * short join; two in a row are the duplicated-frame resume and everything
 * after them has to be encoded again.
 */
export function firstSilentTailIndex(
  trackCounts: readonly number[]
): number | null {
  for (let i = 0; i < trackCounts.length - 1; i++) {
    const here = trackCounts[i] ?? 0;
    const next = trackCounts[i + 1] ?? 0;
    if (here < 2 && next < 2) return i;
  }
  return null;
}

/** Seconds of playlist time before `segmentName`, from EXTINF durations. */
export function playlistTimeBeforeSegment(
  manifest: string,
  segmentName: string
): number | null {
  let acc = 0;
  let pending: number | null = null;
  for (const line of manifest.split(/\r?\n/)) {
    const trimmed = line.trim();
    const inf = /^#EXTINF:([\d.]+)/i.exec(trimmed);
    if (inf) {
      const n = parseFloat(inf[1]!);
      pending = Number.isFinite(n) && n > 0 ? n : null;
      continue;
    }
    if (!trimmed || trimmed.startsWith("#") || pending == null) continue;
    const name = trimmed.split("/").pop() || trimmed;
    if (name === segmentName) return acc;
    acc += pending;
    pending = null;
  }
  return null;
}

/**
 * How far to move a segment so its media time matches the playlist.
 * Small drift is left alone. A resume that restarts at zero is moved.
 */
export function timelineShiftSec(
  expectedStartSec: number,
  actualStartSec: number
): number {
  if (!Number.isFinite(expectedStartSec) || !Number.isFinite(actualStartSec)) {
    return 0;
  }
  const delta = expectedStartSec - actualStartSec;
  if (delta <= 0.5) return 0;
  return delta;
}

function readBox(buf: Buffer, offset: number): Mp4Box | null {
  if (offset + 8 > buf.length) return null;
  let size = buf.readUInt32BE(offset);
  const type = buf.toString("latin1", offset + 4, offset + 8);
  let header = 8;
  if (size === 1) {
    if (offset + 16 > buf.length) return null;
    const large = buf.readBigUInt64BE(offset + 8);
    if (large > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    size = Number(large);
    header = 16;
  } else if (size === 0) {
    size = buf.length - offset;
  }
  if (size < header || offset + size > buf.length) return null;
  return { start: offset, size, type, header };
}

function walkBoxes(
  buf: Buffer,
  start: number,
  end: number,
  visit: (box: Mp4Box) => void
): void {
  let offset = start;
  while (offset + 8 <= end) {
    const box = readBox(buf, offset);
    if (!box) break;
    visit(box);
    if (CONTAINER_TYPES.has(box.type)) {
      walkBoxes(buf, box.start + box.header, box.start + box.size, visit);
    }
    offset = box.start + box.size;
  }
}

function trackIdFromTkhd(buf: Buffer, box: Mp4Box): number | null {
  const version = buf[box.start + box.header];
  const idOff =
    box.start + box.header + 4 + (version === 1 ? 16 : 8);
  if (idOff + 4 > box.start + box.size) return null;
  return buf.readUInt32BE(idOff);
}

function timescaleFromMdhd(buf: Buffer, box: Mp4Box): number | null {
  const version = buf[box.start + box.header];
  const off = box.start + box.header + 4 + (version === 1 ? 16 : 8);
  if (off + 4 > box.start + box.size) return null;
  const timescale = buf.readUInt32BE(off);
  return timescale > 0 ? timescale : null;
}

/** track_id → media timescale, from the init segment. */
export function readTrackTimescales(init: Buffer): Map<number, number> {
  const out = new Map<number, number>();
  const trakBoxes: Mp4Box[] = [];
  walkBoxes(init, 0, init.length, (box) => {
    if (box.type === "trak") trakBoxes.push(box);
  });
  for (const trak of trakBoxes) {
    let trackId: number | null = null;
    let timescale: number | null = null;
    walkBoxes(init, trak.start + trak.header, trak.start + trak.size, (box) => {
      if (box.type === "tkhd" && trackId == null) {
        trackId = trackIdFromTkhd(init, box);
      } else if (box.type === "mdhd" && timescale == null) {
        timescale = timescaleFromMdhd(init, box);
      }
    });
    if (trackId != null && timescale != null) out.set(trackId, timescale);
  }
  return out;
}

function addTicks(buf: Buffer, offset: number, bytes: 4 | 8, ticks: bigint): void {
  if (bytes === 8) {
    const cur = buf.readBigUInt64BE(offset);
    buf.writeBigUInt64BE(cur + ticks, offset);
    return;
  }
  const cur = BigInt(buf.readUInt32BE(offset)) + ticks;
  if (cur < BigInt(0) || cur > BigInt("4294967295")) return;
  buf.writeUInt32BE(Number(cur), offset);
}

function shiftSidx(buf: Buffer, box: Mp4Box, shiftSec: number): void {
  const version = buf[box.start + box.header] ?? 0;
  const timescaleOff = box.start + box.header + 8;
  const eptOff = box.start + box.header + 12;
  if (timescaleOff + 4 > box.start + box.size) return;
  const timescale = buf.readUInt32BE(timescaleOff);
  if (!timescale) return;
  const ticks = BigInt(Math.round(shiftSec * timescale));
  if (version === 0) {
    if (eptOff + 4 <= box.start + box.size) addTicks(buf, eptOff, 4, ticks);
  } else if (eptOff + 8 <= box.start + box.size) {
    addTicks(buf, eptOff, 8, ticks);
  }
}

function shiftTfdt(
  buf: Buffer,
  box: Mp4Box,
  shiftSec: number,
  timescale: number
): void {
  const version = buf[box.start + box.header] ?? 0;
  const off = box.start + box.header + 4;
  const ticks = BigInt(Math.round(shiftSec * timescale));
  if (version === 0) {
    if (off + 4 <= box.start + box.size) addTicks(buf, off, 4, ticks);
  } else if (off + 8 <= box.start + box.size) {
    addTicks(buf, off, 8, ticks);
  }
}

/** Media start of the first track fragment, in seconds. */
export function segmentTimelineStartSec(
  segment: Buffer,
  timescales: ReadonlyMap<number, number>
): number | null {
  let start: number | null = null;
  walkBoxes(segment, 0, segment.length, (box) => {
    if (start != null || box.type !== "traf") return;
    let trackId: number | null = null;
    let base: { version: number; off: number } | null = null;
    walkBoxes(
      segment,
      box.start + box.header,
      box.start + box.size,
      (child) => {
        if (child.type === "tfhd" && trackId == null) {
          const idOff = child.start + child.header + 4;
          if (idOff + 4 <= child.start + child.size) {
            trackId = segment.readUInt32BE(idOff);
          }
        } else if (child.type === "tfdt" && base == null) {
          const version = segment[child.start + child.header] ?? 0;
          const off = child.start + child.header + 4;
          base = { version, off };
        }
      }
    );
    if (trackId == null || base == null) return;
    const timescale = timescales.get(trackId);
    if (!timescale) return;
    const found = base as { version: number; off: number };
    const ticks =
      found.version === 0
        ? segment.readUInt32BE(found.off)
        : Number(segment.readBigUInt64BE(found.off));
    start = ticks / timescale;
  });
  return start;
}

/** Move every track's decode time and the segment index by the same seconds. */
export function shiftFmp4Timeline(
  segment: Buffer,
  shiftSec: number,
  timescales: ReadonlyMap<number, number>
): Buffer {
  if (!(shiftSec > 0) || timescales.size === 0) return segment;
  const out = Buffer.from(segment);
  walkBoxes(out, 0, out.length, (box) => {
    if (box.type === "sidx") {
      shiftSidx(out, box, shiftSec);
      return;
    }
    if (box.type !== "traf") return;
    let trackId: number | null = null;
    const tfdts: Mp4Box[] = [];
    walkBoxes(out, box.start + box.header, box.start + box.size, (child) => {
      if (child.type === "tfhd" && trackId == null) {
        const idOff = child.start + child.header + 4;
        if (idOff + 4 <= child.start + child.size) {
          trackId = out.readUInt32BE(idOff);
        }
      } else if (child.type === "tfdt") {
        tfdts.push(child);
      }
    });
    const timescale = trackId != null ? timescales.get(trackId) : undefined;
    if (!timescale) return;
    for (const tfdt of tfdts) shiftTfdt(out, tfdt, shiftSec, timescale);
  });
  return out;
}
