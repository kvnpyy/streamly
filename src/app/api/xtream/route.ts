import {
  isXtreamCatalogCacheAction,
  xtreamCatalogCacheControlHeader,
} from "@/lib/xtream-catalog-cache";
import { enforceXtreamAuthProbeCaptcha } from "@/lib/xtream-captcha";
import { recordIptvApiError } from "@/lib/iptv-api-error-metrics";
import { snapshotFromListings } from "@/lib/discovery/live-epg";
import { setServerEpgTitle } from "@/lib/epg-server-title-cache";
import {
  EMPTY_XTREAM_EPG,
  isXtreamEpgAction,
} from "@/lib/xtream-epg-actions";
import { tryHandleReviewPanelRequest } from "@/lib/review-panel/handler";
import { extractXtreamEpgPayload } from "@/lib/xtream";
import {
  getXtreamUpstreamCached,
  isXtreamSeriesInfoCacheAction,
  setXtreamUpstreamCached,
  xtreamUpstreamCacheKey,
} from "@/lib/xtream-upstream-cache";
import { fetchXtreamPanelWithRetry } from "@/lib/xtream-upstream-fetch";
import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";
import { NextRequest, NextResponse } from "next/server";

const UPSTREAM_TIMEOUT_MS = 18_000;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function warmServerEpgFromPayload(
  creds: { server: string; username: string; password: string },
  streamId: number,
  json: unknown
): void {
  const payload = extractXtreamEpgPayload(json);
  const listings = payload?.epg_listings;
  if (!listings?.length) return;
  const snap = snapshotFromListings(listings, Math.floor(Date.now() / 1000));
  const title = snap.nowTitle?.trim();
  if (title) setServerEpgTitle(creds, streamId, title);
}

export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;
  const creds = credsOrRes;
  const url = new URL(req.url);
  const captchaBlock = await enforceXtreamAuthProbeCaptcha(
    req,
    creds,
    url.searchParams.get("action")
  );
  if (captchaBlock) return captchaBlock;

  const action = url.searchParams.get("action");
  const epgAction = isXtreamEpgAction(action);

  const cacheParams: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "u") continue;
    cacheParams[k] = v;
  }

  const review = tryHandleReviewPanelRequest(creds, cacheParams);
  if (review !== null) {
    if (epgAction) {
      const streamId = Number(cacheParams.stream_id);
      if (Number.isFinite(streamId) && streamId > 0) {
        warmServerEpgFromPayload(creds, streamId, review);
      }
    }
    const headers = new Headers();
    if (isXtreamCatalogCacheAction(action)) {
      headers.set("Cache-Control", xtreamCatalogCacheControlHeader());
    }
    headers.set("X-Xtream-Cache", "review-panel");
    return NextResponse.json(review, { headers });
  }

  const upstream = new URL(`${creds.server}/player_api.php`);
  upstream.searchParams.set("username", creds.username);
  upstream.searchParams.set("password", creds.password);
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "u") continue;
    upstream.searchParams.set(k, v);
  }
  const upstreamCacheKey = xtreamUpstreamCacheKey(creds, cacheParams);
  const cacheableUpstream =
    isXtreamCatalogCacheAction(action) ||
    epgAction ||
    isXtreamSeriesInfoCacheAction(action);
  if (cacheableUpstream) {
    const hit = getXtreamUpstreamCached(upstreamCacheKey);
    if (hit) {
      try {
        const json = JSON.parse(hit);
        if (epgAction && creds) {
          const streamId = Number(cacheParams.stream_id);
          if (Number.isFinite(streamId) && streamId > 0) {
            warmServerEpgFromPayload(creds, streamId, json);
          }
        }
        const headers = new Headers();
        if (isXtreamCatalogCacheAction(action)) {
          headers.set("Cache-Control", xtreamCatalogCacheControlHeader());
        }
        headers.set("X-Xtream-Cache", "hit");
        return NextResponse.json(json, { headers });
      } catch {
        /* refetch */
      }
    }
  }

  try {
    const res = await fetchXtreamPanelWithRetry(upstream.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 IPTVSmartersPlayer/3.1.5",
        Accept: "application/json,text/plain,*/*",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    const text = await res.text();
    if (!res.ok) {
      if (epgAction) {
        return NextResponse.json(EMPTY_XTREAM_EPG);
      }
      recordIptvApiError("catalog_upstream_error");
      return NextResponse.json(
        {
          error:
            "IPTV server rejected the request or returned an error. Check server URL and credentials.",
          upstreamStatus: res.status,
        },
        { status: 502 }
      );
    }
    try {
      const json = JSON.parse(text);
      if (cacheableUpstream) {
        setXtreamUpstreamCached(upstreamCacheKey, text, action);
      }
      if (epgAction && creds) {
        const streamId = Number(cacheParams.stream_id);
        if (Number.isFinite(streamId) && streamId > 0) {
          warmServerEpgFromPayload(creds, streamId, json);
        }
      }
      const headers = new Headers();
      if (isXtreamCatalogCacheAction(action)) {
        headers.set("Cache-Control", xtreamCatalogCacheControlHeader());
      }
      headers.set("X-Xtream-Cache", "miss");
      return NextResponse.json(json, { headers });
    } catch {
      if (epgAction) {
        return NextResponse.json(EMPTY_XTREAM_EPG);
      }
      recordIptvApiError("catalog_upstream_error");
      return NextResponse.json(
        {
          error:
            "IPTV server returned data this app could not parse as JSON. The provider may be offline or blocking proxy requests.",
        },
        { status: 502 }
      );
    }
  } catch {
    if (epgAction) {
      return NextResponse.json(EMPTY_XTREAM_EPG);
    }
    recordIptvApiError("catalog_upstream_error");
    return NextResponse.json(
      {
        error:
          "Could not reach the IPTV server from this app. Check network, firewall, and server URL.",
      },
      { status: 502 }
    );
  }
}
