import { requireIptvCredsFromRequest } from "@/lib/iptv-request-creds";
import { looksLikeSubtitleText, toWebVtt } from "@/lib/subtitle-vtt";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FETCH_MS = 12_000;
const MAX_BYTES = 1_500_000;
const IPTV_UA = "VLC/3.0.20 LibVLC/3.0.20";

/**
 * Proxy provider SRT/VTT files as WebVTT for `<track>` / blob URLs.
 * Requires IPTV creds so this is not an open proxy.
 */
export async function GET(req: NextRequest) {
  const credsOrRes = requireIptvCredsFromRequest(req);
  if (credsOrRes instanceof NextResponse) return credsOrRes;

  const target = new URL(req.url).searchParams.get("u")?.trim() ?? "";
  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new Response("Bad subtitle URL", { status: 400 });
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return new Response("Unsupported scheme", { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const origin = parsed.origin;
    const upstream = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": IPTV_UA,
        Accept: "text/vtt, text/plain, application/x-subrip, */*",
        Referer: `${origin}/`,
      },
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!upstream.ok) {
      return new Response("Subtitle unavailable", { status: 502 });
    }
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) {
      return new Response("Subtitle too large", { status: 413 });
    }
    const raw = new TextDecoder("utf-8", { fatal: false }).decode(buf);
    if (!looksLikeSubtitleText(raw)) {
      return new Response("Not a subtitle file", { status: 415 });
    }
    const vtt = toWebVtt(raw);
    return new Response(vtt, {
      status: 200,
      headers: {
        "content-type": "text/vtt; charset=utf-8",
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return new Response("Subtitle fetch failed", { status: 502 });
  } finally {
    clearTimeout(timer);
  }
}
