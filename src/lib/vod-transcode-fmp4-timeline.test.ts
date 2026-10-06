import { describe, expect, it } from "vitest";
import {
  countTfdtBoxes,
  firstSilentTailIndex,
  initDeclaresAudio,
  playlistTimeBeforeSegment,
  readTrackTimescales,
  segmentTimelineStartSec,
  shiftFmp4Timeline,
  timelineShiftSec,
} from "@/lib/vod-transcode-fmp4-timeline";

function u32(n: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
}

function box(type: string, payload: Buffer): Buffer {
  return Buffer.concat([u32(8 + payload.length), Buffer.from(type), payload]);
}

function sampleInit(): Buffer {
  const mdhd = (timescale: number) =>
    box("mdhd", Buffer.concat([u32(0), u32(0), u32(0), u32(timescale), u32(1000), Buffer.alloc(4)]));
  const tkhd = (id: number) =>
    box("tkhd", Buffer.concat([u32(0), u32(0), u32(0), u32(id)]));
  const hdlr = (kind: string) =>
    box("hdlr", Buffer.concat([Buffer.alloc(8), Buffer.from(kind)]));
  const trak = (id: number, timescale: number, kind: string) =>
    box("trak", Buffer.concat([tkhd(id), box("mdia", Buffer.concat([mdhd(timescale), hdlr(kind)]))]));
  return box(
    "moov",
    Buffer.concat([trak(1, 12288, "vide"), trak(2, 48000, "soun")])
  );
}

function sampleSegment(): Buffer {
  const tfhd = (id: number) => box("tfhd", Buffer.concat([u32(0), u32(id)]));
  const tfdt = () => box("tfdt", Buffer.concat([u32(0x01000000), Buffer.alloc(8)]));
  const traf = (id: number) => box("traf", Buffer.concat([tfhd(id), tfdt()]));
  const sidx = box(
    "sidx",
    Buffer.concat([
      u32(0x01000000),
      u32(1),
      u32(12288),
      Buffer.alloc(8),
      Buffer.alloc(8),
      u32(0),
    ])
  );
  return Buffer.concat([sidx, box("moof", Buffer.concat([traf(1), traf(2)]))]);
}

describe("silent fmp4 tail", () => {
  it("cuts at the first run of video-only pieces", () => {
    expect(firstSilentTailIndex([2, 2, 2, 1, 1, 2])).toBe(3);
    expect(firstSilentTailIndex([2, 1, 2, 2])).toBeNull();
    expect(initDeclaresAudio(sampleInit())).toBe(true);
    expect(initDeclaresAudio(Buffer.from("vide"))).toBe(false);
  });
});

describe("fmp4 timeline shift", () => {
  it("moves a restarted segment onto the episode clock", () => {
    const init = sampleInit();
    const scales = readTrackTimescales(init);
    expect(scales.get(1)).toBe(12288);
    expect(scales.get(2)).toBe(48000);
    const raw = sampleSegment();
    expect(segmentTimelineStartSec(raw, scales)).toBe(0);
    expect(countTfdtBoxes(raw)).toBe(2);
    expect(
      playlistTimeBeforeSegment(
        "#EXTINF:4.0,\nseg_00000.m4s\n#EXTINF:4.0,\nseg_00001.m4s\n",
        "seg_00001.m4s"
      )
    ).toBe(4);
    expect(timelineShiftSec(300, 0)).toBe(300);
    expect(timelineShiftSec(300, 299.7)).toBe(0);
    expect(timelineShiftSec(300, 298)).toBe(2);

    const shifted = shiftFmp4Timeline(raw, 10, scales);
    expect(segmentTimelineStartSec(shifted, scales)).toBeCloseTo(10, 5);
    const first = shifted.indexOf("tfdt");
    const second = shifted.indexOf("tfdt", first + 4);
    expect(shifted.readBigUInt64BE(first + 8)).toBe(BigInt(10 * 12288));
    expect(shifted.readBigUInt64BE(second + 8)).toBe(BigInt(10 * 48000));
    const sidx = shifted.indexOf("sidx");
    expect(shifted.readBigUInt64BE(sidx + 16)).toBe(BigInt(10 * 12288));
  });
});
