import { describe, expect, it } from "vitest";
import {
  createXmltvWindowParser,
  linkGuideChannels,
  parseXmltvStamp,
  searchOnAirGuide,
  type OnAirGuideIndex,
} from "@/lib/on-air-guide";
import type { LiveStream } from "@/lib/xtream-types";

const NOW = 1_700_000_000;

function stamp(unix: number): string {
  const d = new Date(unix * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())} +0000`;
}

function stream(
  id: number,
  name: string,
  epg?: string
): LiveStream {
  return {
    stream_id: id,
    name,
    category_id: "1",
    stream_icon: "",
    epg_channel_id: epg,
  } as LiveStream;
}

function guideFromXml(xml: string, streams: LiveStream[]): OnAirGuideIndex {
  const parser = createXmltvWindowParser(NOW);
  const mid = Math.floor(xml.length / 2);
  parser.push(xml.slice(0, mid));
  parser.push(xml.slice(mid));
  parser.finish();
  return {
    builtAt: NOW * 1000,
    programmes: parser.programmes,
    streamIdsByChannelId: linkGuideChannels(parser.channels, streams),
    source: "xmltv",
  };
}

describe("on-air guide search", () => {
  const xml = `<?xml version="1.0"?>
<tv>
  <channel id="espn.us"><display-name>ESPN HD</display-name></channel>
  <channel id="abc.us"><display-name>ABC</display-name></channel>
  <programme start="${stamp(NOW - 600)}" stop="${stamp(NOW + 3600)}" channel="espn.us">
    <title>Lakers at Celtics</title>
  </programme>
  <programme start="${stamp(NOW + 1800)}" stop="${stamp(NOW + 5400)}" channel="abc.us">
    <title>Jeopardy!</title>
  </programme>
  <programme start="${stamp(NOW + 10 * 3600)}" stop="${stamp(NOW + 12 * 3600)}" channel="espn.us">
    <title>Lakers classic</title>
  </programme>
  <programme start="${stamp(NOW - 600)}" stop="${stamp(NOW + 3600)}" channel="abc.us">
    <title>Law &amp; Order</title>
  </programme>
</tv>`;

  const streams = [
    stream(5, "US: ESPN FHD", "espn.us"),
    stream(6, "US: ESPN", "espn.us"),
    stream(9, "ABC East", "abc.us"),
  ];

  it("parses an XMLTV timestamp as UTC", () => {
    expect(parseXmltvStamp(stamp(NOW))).toBe(NOW);
  });

  it("matches the event that is on, not the network name", () => {
    const guide = guideFromXml(xml, streams);
    const hits = searchOnAirGuide(guide, {
      q: "lakers",
      nowSec: NOW,
      streamById: new Map(streams.map((s) => [s.stream_id, s])),
    });
    expect(hits.map((h) => h.title)).toEqual([
      "Lakers at Celtics",
      "Lakers at Celtics",
    ]);
    expect(hits[0]?.slot).toBe("now");
    expect(hits.map((h) => h.stream.stream_id)).toEqual([5, 6]);
    expect(hits.some((h) => h.stream.name.includes("ABC"))).toBe(false);
  });

  it("does not treat a channel name as a programme hit", () => {
    const guide = guideFromXml(xml, streams);
    const hits = searchOnAirGuide(guide, {
      q: "espn",
      nowSec: NOW,
      streamById: new Map(streams.map((s) => [s.stream_id, s])),
    });
    expect(hits).toEqual([]);
  });

  it("includes a show that starts in the next few hours", () => {
    const guide = guideFromXml(xml, streams);
    const hits = searchOnAirGuide(guide, {
      q: "jeopardy",
      nowSec: NOW,
      streamById: new Map(streams.map((s) => [s.stream_id, s])),
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.slot).toBe("upcoming");
    expect(hits[0]?.stream.stream_id).toBe(9);
  });

  it("decodes titles and links channels by normalized name", () => {
    const named = [stream(4, "ABC HD")];
    const guide = guideFromXml(xml, named);
    const hits = searchOnAirGuide(guide, {
      q: "law order",
      nowSec: NOW,
      streamById: new Map(named.map((s) => [s.stream_id, s])),
    });
    expect(hits[0]?.title).toBe("Law & Order");
    expect(hits[0]?.stream.stream_id).toBe(4);
  });

  it("adds cached provider titles the guide did not map", () => {
    const guide = guideFromXml(xml, streams);
    const extra = stream(12, "TNT");
    const hits = searchOnAirGuide(guide, {
      q: "inside the nba",
      nowSec: NOW,
      streamById: new Map([
        ...streams.map((s) => [s.stream_id, s] as const),
        [extra.stream_id, extra],
      ]),
      cachedTitles: [{ streamId: 12, title: "Inside the NBA" }],
    });
    expect(hits.map((h) => h.stream.stream_id)).toEqual([12]);
    expect(hits[0]?.slot).toBe("now");
  });
});
