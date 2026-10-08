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
  "mvex",
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

/** track_id → default sample duration (ticks), from the init segment's trex. */
export function readTrackDefaultDurations(init: Buffer): Map<number, number> {
  const out = new Map<number, number>();
  walkBoxes(init, 0, init.length, (box) => {
    if (box.type !== "trex") return;
    const off = box.start + box.header + 4;
    if (off + 12 > box.start + box.size) return;
    out.set(init.readUInt32BE(off), init.readUInt32BE(off + 8));
  });
  return out;
}

function trunDurationTicks(
  buf: Buffer,
  box: Mp4Box,
  defaultDuration: number
): number {
  const end = box.start + box.size;
  let p = box.start + box.header;
  if (p + 8 > end) return 0;
  const flags = buf.readUInt32BE(p) & 0xffffff;
  const count = buf.readUInt32BE(p + 4);
  p += 8;
  if (flags & 0x1) p += 4;
  if (flags & 0x4) p += 4;
  const perSample =
    (flags & 0x100 ? 4 : 0) +
    (flags & 0x200 ? 4 : 0) +
    (flags & 0x400 ? 4 : 0) +
    (flags & 0x800 ? 4 : 0);
  if (!(flags & 0x100)) return count * defaultDuration;
  let total = 0;
  for (let i = 0; i < count && p + 4 <= end; i++) {
    total += buf.readUInt32BE(p);
    p += perSample;
  }
  return total;
}

/**
 * Media end (decode time + sample durations) of the track in the first track
 * fragment, in seconds. The next segment of an unbroken encode starts here.
 */
export function segmentTimelineEndSec(
  segment: Buffer,
  timescales: ReadonlyMap<number, number>,
  defaultDurations: ReadonlyMap<number, number> = new Map()
): number | null {
  let track: number | null = null;
  let endTicks: number | null = null;
  walkBoxes(segment, 0, segment.length, (box) => {
    if (box.type !== "traf") return;
    let trackId: number | null = null;
    let defaultDuration: number | null = null;
    let base: number | null = null;
    let ticks = 0;
    walkBoxes(segment, box.start + box.header, box.start + box.size, (child) => {
      const at = child.start + child.header;
      const end = child.start + child.size;
      if (child.type === "tfhd" && trackId == null && at + 8 <= end) {
        const flags = segment.readUInt32BE(at) & 0xffffff;
        trackId = segment.readUInt32BE(at + 4);
        let p = at + 8;
        if (flags & 0x1) p += 8;
        if (flags & 0x2) p += 4;
        if (flags & 0x8 && p + 4 <= end) defaultDuration = segment.readUInt32BE(p);
      } else if (child.type === "tfdt" && base == null) {
        const version = segment[at] ?? 0;
        base =
          version === 0
            ? segment.readUInt32BE(at + 4)
            : Number(segment.readBigUInt64BE(at + 4));
      } else if (child.type === "trun" && trackId != null) {
        ticks += trunDurationTicks(
          segment,
          child,
          defaultDuration ?? defaultDurations.get(trackId) ?? 0
        );
      }
    });
    if (trackId == null || base == null) return;
    if (track == null) track = trackId;
    if (trackId !== track) return;
    const fragEnd = base + ticks;
    endTicks = endTicks == null ? fragEnd : Math.max(endTicks, fragEnd);
  });
  if (track == null || endTicks == null) return null;
  const timescale = timescales.get(track);
  return timescale ? endTicks / timescale : null;
}

/**
 * How far to move a segment so it starts where the previous one ended.
 * Only a restart that went back in time is moved; an unbroken encode is left
 * exactly as ffmpeg wrote it.
 */
export function continuityShiftSec(
  previousEndSec: number | null,
  actualStartSec: number
): number {
  if (previousEndSec == null || !Number.isFinite(previousEndSec)) return 0;
  if (!Number.isFinite(actualStartSec)) return 0;
  const delta = previousEndSec - actualStartSec;
  return delta > 0.5 ? delta : 0;
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
