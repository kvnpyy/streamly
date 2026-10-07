import "server-only";

import { serverEpgAccountKey } from "@/lib/epg-server-title-cache";
import {
  createXmltvWindowParser,
  linkGuideChannels,
  type OnAirGuideIndex,
} from "@/lib/on-air-guide";
import { tryParseHttpUrl } from "@/lib/utils";
import { fetchXtreamPanelWithRetry } from "@/lib/xtream-upstream-fetch";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";

const READY_TTL_MS = 20 * 60 * 1000;
const EMPTY_TTL_MS = 10 * 60 * 1000;
const FETCH_TIMEOUT_MS = 25_000;
const MAX_BYTES = 96 * 1024 * 1024;

const cache = new Map<string, OnAirGuideIndex>();
const inflight = new Map<string, Promise<OnAirGuideIndex>>();

function emptyIndex(): OnAirGuideIndex {
  return {
    builtAt: Date.now(),
    programmes: [],
    streamIdsByChannelId: new Map(),
    source: "none",
  };
}

function fresh(index: OnAirGuideIndex): boolean {
  const ttl = index.source === "xmltv" ? READY_TTL_MS : EMPTY_TTL_MS;
  return Date.now() - index.builtAt < ttl;
}

async function downloadGuide(
  creds: XtreamCredentials,
  streams: LiveStream[]
): Promise<OnAirGuideIndex> {
  const serverUrl = tryParseHttpUrl(creds.server);
  if (!serverUrl) return emptyIndex();

  const upstream = new URL("xmltv.php", serverUrl);
  upstream.searchParams.set("username", creds.username);
  upstream.searchParams.set("password", creds.password);

  let res: Response;
  try {
    res = await fetchXtreamPanelWithRetry(
      upstream.toString(),
      {
        method: "GET",
        headers: {
          Accept: "application/xml,text/xml,*/*",
          "User-Agent":
            "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 IPTVSmartersPlayer/3.1.5",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
      { attempts: 1 }
    );
  } catch {
    return emptyIndex();
  }

  if (!res.ok || !res.body) return emptyIndex();

  const nowSec = Math.floor(Date.now() / 1000);
  const parser = createXmltvWindowParser(nowSec);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let sawXml = false;

  try {
    while (bytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      const text = decoder.decode(value, { stream: true });
      if (!sawXml) {
        const head = text.slice(0, 800).trimStart();
        if (head.startsWith("{") || head.startsWith("<!DOCTYPE html")) {
          await reader.cancel().catch(() => {});
          return emptyIndex();
        }
        if (
          head.includes("<tv") ||
          head.includes("<channel") ||
          head.includes("<programme") ||
          head.includes("<?xml")
        ) {
          sawXml = true;
        }
      }
      parser.push(text);
    }
    parser.push(decoder.decode());
    parser.finish();
  } catch {
    return emptyIndex();
  } finally {
    reader.releaseLock?.();
  }

  if (!sawXml || parser.programmes.length === 0) return emptyIndex();

  return {
    builtAt: Date.now(),
    programmes: parser.programmes,
    streamIdsByChannelId: linkGuideChannels(parser.channels, streams),
    source: "xmltv",
  };
}

/** Cached provider guide for what’s on now and in the next few hours. */
export async function getOnAirGuide(
  creds: XtreamCredentials,
  streams: LiveStream[]
): Promise<OnAirGuideIndex> {
  const key = serverEpgAccountKey(creds);
  const hit = cache.get(key);
  if (hit && fresh(hit)) return hit;

  const pending = inflight.get(key);
  if (pending) return hit ?? pending;

  const job = downloadGuide(creds, streams)
    .then((index) => {
      cache.set(key, index);
      return index;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, job);

  if (hit) {
    void job.catch(() => {});
    return hit;
  }
  return job;
}

export function clearOnAirGuideCacheForTests(): void {
  cache.clear();
  inflight.clear();
}
