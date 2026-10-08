import { describe, expect, it } from "vitest";
import {
  continuityShiftSec,
  countTfdtBoxes,
  firstSilentTailIndex,
  initDeclaresAudio,
  readTrackDefaultDurations,
  readTrackTimescales,
  segmentTimelineEndSec,
  segmentTimelineStartSec,
  shiftFmp4Timeline,
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

function timedSegment(opts: {
  baseTicks: number;
  defaultDuration?: number;
  sampleDurations?: number[];
  count?: number;
}): Buffer {
  const tfhd =
    opts.defaultDuration != null
      ? box("tfhd", Buffer.concat([u32(0x08), u32(1), u32(opts.defaultDuration)]))
      : box("tfhd", Buffer.concat([u32(0), u32(1)]));
  const tfdt = box("tfdt", Buffer.concat([u32(0x01000000), Buffer.alloc(4), u32(opts.baseTicks)]));
  const trun = opts.sampleDurations
    ? box(
        "trun",
        Buffer.concat([
          u32(0x000301),
          u32(opts.sampleDurations.length),
          u32(0),
          ...opts.sampleDurations.flatMap((d) => [u32(d), u32(100)]),
        ])
      )
    : box("trun", Buffer.concat([u32(0x000001), u32(opts.count ?? 0), u32(0)]));
  return box("moof", box("traf", Buffer.concat([tfhd, tfdt, trun])));
}

describe("fmp4 segment continuity", () => {
  const scales = new Map([[1, 12288]]);

  it("measures where a segment ends from its sample durations", () => {
    const perSample = timedSegment({ baseTicks: 12288 * 8, sampleDurations: [512, 512, 1024] });
    expect(segmentTimelineEndSec(perSample, scales)).toBeCloseTo(8 + 2048 / 12288, 6);

    const byDefault = timedSegment({ baseTicks: 0, defaultDuration: 512, count: 96 });
    expect(segmentTimelineEndSec(byDefault, scales)).toBeCloseTo(4, 6);

    const fromTrex = timedSegment({ baseTicks: 0, count: 24 });
    expect(segmentTimelineEndSec(fromTrex, scales, new Map([[1, 512]]))).toBeCloseTo(1, 6);
  });

  it("leaves a short piece of an unbroken encode alone", () => {
    // Previous piece ran 80.0–80.3; the next starts right there, even though
    // a rounded playlist would put it at 84.
    expect(continuityShiftSec(80.3, 80.3)).toBe(0);
    expect(continuityShiftSec(80.3, 80.28)).toBe(0);
  });

  it("moves a restarted piece to follow the previous one", () => {
    expect(continuityShiftSec(1200, 0)).toBe(1200);
    expect(continuityShiftSec(1200, 2)).toBe(1198);
    expect(continuityShiftSec(null, 0)).toBe(0);
  });

  it("reads trex defaults from the init segment", () => {
    const trex = box("trex", Buffer.concat([u32(0), u32(1), u32(1), u32(512), u32(0), u32(0)]));
    const init = box("moov", box("mvex", trex));
    expect(readTrackDefaultDurations(init).get(1)).toBe(512);
  });
});
