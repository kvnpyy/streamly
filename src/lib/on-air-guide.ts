import { decodeEpgText } from "@/lib/epg-text";
import { normalizeChannelName } from "@/lib/external-epg";
import { scoreLiveSearchField } from "@/lib/live-search-rank";
import { normalizeSearchText } from "@/lib/search-normalize";
import type { LiveStream } from "@/lib/xtream-types";
import { looksAdult } from "@/lib/utils";

/** How far ahead a search can see a programme that has not started. */
export const ON_AIR_LOOKAHEAD_SEC = 6 * 60 * 60;
/** Clock skew: keep a programme that ended a few minutes ago. */
export const ON_AIR_LOOKBACK_SEC = 10 * 60;

export const ON_AIR_SEARCH_LIMIT = 36;
const FEEDS_PER_PROGRAMME = 3;

export type OnAirSlot = "now" | "upcoming";

export type OnAirGuideProgramme = {
  channelId: string;
  title: string;
  start: number;
  end: number;
};

export type OnAirGuideIndex = {
  builtAt: number;
  programmes: OnAirGuideProgramme[];
  /** XMLTV channel id → live stream ids on this playlist. */
  streamIdsByChannelId: Map<string, number[]>;
  source: "xmltv" | "none";
};

export type OnAirSearchHit = {
  stream: LiveStream;
  title: string;
  slot: OnAirSlot;
  start: number;
  end: number;
  score: number;
};

type XmltvParser = {
  push: (chunk: string) => void;
  finish: () => void;
  channels: Map<string, string>;
  programmes: OnAirGuideProgramme[];
};

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16))
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)));
}

function xmlText(raw: string): string {
  const cdata = raw.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const inner = cdata ? cdata[1]! : raw;
  return decodeEntities(inner).replace(/<[^>]+>/g, "").trim();
}

/** Xtream / XMLTV stamp: `20261007013000 +0000`. */
export function parseXmltvStamp(s: string): number {
  const m = s.match(
    /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{2})(\d{2})?$/
  );
  if (!m) return 0;
  const [, y, mo, d, h, mi, se, tzH = "+00", tzM = "00"] = m;
  const tzSign = tzH.startsWith("-") ? -1 : 1;
  const tzMin =
    tzSign * (Math.abs(parseInt(tzH, 10)) * 60 + parseInt(tzM, 10));
  const utc = Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +se!);
  return Math.floor((utc - tzMin * 60_000) / 1000);
}

function attr(block: string, name: string): string {
  const m = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(block);
  return m?.[1] ?? "";
}

function programmeTitle(block: string): string {
  const m = block.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return "";
  return decodeEpgText(xmlText(m[1]!)).trim();
}

/**
 * Pull channel names and programmes that overlap [now - lookback, now + lookahead]
 * out of an XMLTV document. Safe to feed in chunks.
 */
export function createXmltvWindowParser(
  nowSec: number,
  opts?: { lookbackSec?: number; lookaheadSec?: number; maxProgrammes?: number }
): XmltvParser {
  const lookback = opts?.lookbackSec ?? ON_AIR_LOOKBACK_SEC;
  const lookahead = opts?.lookaheadSec ?? ON_AIR_LOOKAHEAD_SEC;
  const maxProgrammes = opts?.maxProgrammes ?? 40_000;
  const from = nowSec - lookback;
  const to = nowSec + lookahead;
  const channels = new Map<string, string>();
  const programmes: OnAirGuideProgramme[] = [];
  let buf = "";

  function takeBlock(closeTag: string): string | null {
    const end = buf.indexOf(closeTag);
    if (end === -1) {
      if (buf.length > 512_000) buf = buf.slice(closeTag.length);
      return null;
    }
    const block = buf.slice(0, end + closeTag.length);
    buf = buf.slice(end + closeTag.length);
    return block;
  }

  function drain(): void {
    while (programmes.length < maxProgrammes) {
      const channelAt = buf.indexOf("<channel");
      const programmeAt = buf.indexOf("<programme");
      if (channelAt === -1 && programmeAt === -1) {
        const lt = buf.lastIndexOf("<");
        buf = lt >= 0 ? buf.slice(lt) : "";
        return;
      }
      const useProgramme =
        programmeAt !== -1 && (channelAt === -1 || programmeAt < channelAt);
      const at = useProgramme ? programmeAt : channelAt;
      if (at > 0) buf = buf.slice(at);
      if (useProgramme) {
        const block = takeBlock("</programme>");
        if (!block) return;
        const start = parseXmltvStamp(attr(block, "start"));
        const end = parseXmltvStamp(attr(block, "stop"));
        const channelId = attr(block, "channel").trim().toLowerCase();
        const title = programmeTitle(block);
        if (!start || !end || !channelId || !title) continue;
        if (end < from || start > to) continue;
        programmes.push({ channelId, title, start, end });
      } else {
        const block = takeBlock("</channel>");
        if (!block) return;
        const id = attr(block, "id").trim().toLowerCase();
        const nameMatch = block.match(
          /<display-name[^>]*>([\s\S]*?)<\/display-name>/i
        );
        const name = nameMatch ? xmlText(nameMatch[1]!) : "";
        if (id && name) channels.set(id, name);
      }
    }
  }

  return {
    channels,
    programmes,
    push(chunk: string) {
      if (programmes.length >= maxProgrammes) return;
      buf += chunk;
      drain();
    },
    finish() {
      drain();
      buf = "";
    },
  };
}

function uniqueIds(ids: number[]): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function pushId(map: Map<string, number[]>, key: string, id: number): void {
  const bucket = map.get(key);
  if (bucket) bucket.push(id);
  else map.set(key, [id]);
}

/**
 * Map XMLTV channel ids onto this playlist.
 * Provider epg ids win, then a numeric stream id, then an exact normalized name.
 */
export function linkGuideChannels(
  channels: Map<string, string>,
  streams: LiveStream[]
): Map<string, number[]> {
  const byEpg = new Map<string, number[]>();
  const byStreamId = new Map<string, number[]>();
  const byName = new Map<string, number[]>();

  for (const stream of streams) {
    pushId(byStreamId, String(stream.stream_id), stream.stream_id);
    const epg = stream.epg_channel_id?.trim().toLowerCase();
    if (epg) pushId(byEpg, epg, stream.stream_id);
    const norm = normalizeChannelName(stream.name);
    if (norm) pushId(byName, norm, stream.stream_id);
  }

  const out = new Map<string, number[]>();
  const consider = new Set<string>([
    ...channels.keys(),
    ...byEpg.keys(),
    ...byStreamId.keys(),
  ]);

  for (const rawId of consider) {
    const channelId = rawId.trim().toLowerCase();
    const display = channels.get(channelId) ?? channels.get(rawId) ?? "";
    const fromEpg = byEpg.get(channelId);
    const fromId = byStreamId.get(channelId);
    const norm = display ? normalizeChannelName(display) : "";
    const fromName = norm ? byName.get(norm) : undefined;
    const ids = fromEpg?.length
      ? fromEpg
      : fromId?.length
        ? fromId
        : (fromName ?? []);
    const unique = uniqueIds(ids);
    if (unique.length) out.set(channelId, unique);
  }
  return out;
}

function pickFeeds(
  ids: number[],
  streamById: Map<number, LiveStream>
): LiveStream[] {
  const streams: LiveStream[] = [];
  for (const id of ids) {
    const stream = streamById.get(id);
    if (stream) streams.push(stream);
  }
  streams.sort((a, b) => {
    const aHd = /\b(fhd|uhd|4k|hd)\b/i.test(a.name) ? 0 : 1;
    const bHd = /\b(fhd|uhd|4k|hd)\b/i.test(b.name) ? 0 : 1;
    if (aHd !== bHd) return aHd - bHd;
    return a.name.length - b.name.length || a.stream_id - b.stream_id;
  });
  return streams.slice(0, FEEDS_PER_PROGRAMME);
}

function allowedStream(
  stream: LiveStream,
  opts: {
    allowedIds: Set<number> | null;
    hideAdult: boolean;
    categoryNameById: Map<string, string>;
  }
): boolean {
  if (opts.allowedIds && !opts.allowedIds.has(stream.stream_id)) return false;
  if (!opts.hideAdult) return true;
  return !looksAdult({
    category_name: opts.categoryNameById.get(String(stream.category_id)),
    name: stream.name,
    is_adult: stream.is_adult,
  });
}

function slotFor(programme: { start: number; end: number }, nowSec: number): OnAirSlot | null {
  if (programme.end <= nowSec) return null;
  if (programme.start <= nowSec) return "now";
  return "upcoming";
}

/**
 * Find playlist channels whose current or upcoming programme title matches
 * the query. Channel names are ignored — this is the event, not the network.
 */
export function searchOnAirGuide(
  guide: OnAirGuideIndex,
  opts: {
    q: string;
    nowSec: number;
    streamById: Map<number, LiveStream>;
    allowedIds?: Set<number> | null;
    hideAdult?: boolean;
    categoryNameById?: Map<string, string>;
    cachedTitles?: Array<{ streamId: number; title: string }>;
    limit?: number;
  }
): OnAirSearchHit[] {
  const needle = normalizeSearchText(opts.q);
  if (!needle) return [];

  const limit = opts.limit ?? ON_AIR_SEARCH_LIMIT;
  const gate = {
    allowedIds: opts.allowedIds ?? null,
    hideAdult: opts.hideAdult === true,
    categoryNameById: opts.categoryNameById ?? new Map<string, string>(),
  };

  const hits: OnAirSearchHit[] = [];
  const seen = new Set<number>();

  const consider = (
    stream: LiveStream,
    title: string,
    slot: OnAirSlot,
    start: number,
    end: number,
    score: number
  ) => {
    if (seen.has(stream.stream_id)) return;
    if (!allowedStream(stream, gate)) return;
    seen.add(stream.stream_id);
    hits.push({ stream, title, slot, start, end, score });
  };

  const ranked: Array<{
    programme: OnAirGuideProgramme;
    score: number;
    slot: OnAirSlot;
  }> = [];

  for (const programme of guide.programmes) {
    const score = scoreLiveSearchField(
      normalizeSearchText(programme.title),
      needle
    );
    if (score <= 0) continue;
    const slot = slotFor(programme, opts.nowSec);
    if (!slot) continue;
    ranked.push({ programme, score, slot });
  }

  ranked.sort((a, b) => {
    if (a.slot !== b.slot) return a.slot === "now" ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return a.programme.start - b.programme.start;
  });

  for (const row of ranked) {
    if (hits.length >= limit) break;
    const ids = guide.streamIdsByChannelId.get(row.programme.channelId);
    if (!ids?.length) continue;
    for (const stream of pickFeeds(ids, opts.streamById)) {
      if (hits.length >= limit) break;
      consider(
        stream,
        row.programme.title,
        row.slot,
        row.programme.start,
        row.programme.end,
        row.score
      );
    }
  }

  if (hits.length < limit && opts.cachedTitles?.length) {
    const cached = [...opts.cachedTitles].sort((a, b) => {
      const as = scoreLiveSearchField(normalizeSearchText(a.title), needle);
      const bs = scoreLiveSearchField(normalizeSearchText(b.title), needle);
      return bs - as;
    });
    for (const row of cached) {
      if (hits.length >= limit) break;
      const score = scoreLiveSearchField(normalizeSearchText(row.title), needle);
      if (score <= 0) continue;
      const stream = opts.streamById.get(row.streamId);
      if (!stream) continue;
      consider(stream, row.title.trim(), "now", 0, 0, score);
    }
  }

  return hits;
}
