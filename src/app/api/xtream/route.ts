import {
  isXtreamCatalogCacheAction,
  xtreamCatalogCacheControlHeader,
} from "@/lib/xtream-catalog-cache";
import { enforceXtreamAuthProbeCaptcha } from "@/lib/xtream-captcha";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readCreds(req: NextRequest) {
  const server = req.headers.get("x-iptv-server");
  const username = req.headers.get("x-iptv-username");
  const password = req.headers.get("x-iptv-password");
  if (!server || !username || !password) return null;
  return { server: server.replace(/\/+$/, ""), username, password };
}

export async function GET(req: NextRequest) {
  const creds = readCreds(req);
  if (!creds) {
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  const url = new URL(req.url);
  const captchaBlock = await enforceXtreamAuthProbeCaptcha(
    req,
    creds,
    url.searchParams.get("action")
  );
  if (captchaBlock) return captchaBlock;
  const upstream = new URL(`${creds.server}/player_api.php`);
  upstream.searchParams.set("username", creds.username);
  upstream.searchParams.set("password", creds.password);
  for (const [k, v] of url.searchParams.entries()) {
    if (k === "u") continue;
    upstream.searchParams.set(k, v);
  }
  try {
    const res = await fetch(upstream.toString(), {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 IPTVSmartersPlayer/3.1.5",
        Accept: "application/json,text/plain,*/*",
      },
      cache: "no-store",
    });
    const text = await res.text();
    if (!res.ok) {
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
      const action = url.searchParams.get("action");
      const headers = new Headers();
      if (isXtreamCatalogCacheAction(action)) {
        headers.set("Cache-Control", xtreamCatalogCacheControlHeader());
      }
      return NextResponse.json(json, { headers });
    } catch {
      return NextResponse.json(
        {
          error:
            "IPTV server returned data this app could not parse as JSON. The provider may be offline or blocking proxy requests.",
        },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json(
      {
        error:
          "Could not reach the IPTV server from this app. Check network, firewall, and server URL.",
      },
      { status: 502 }
    );
  }
}
