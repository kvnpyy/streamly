import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const IMAGE_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36";

/** Fail faster on unreachable logo CDNs so lists don't hang while scrolling. */
const FETCH_MS = 12_000;

/** 1×1 transparent PNG — returned as 200 so `<img>` doesn't surface 502 spam in DevTools. */
const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);

function fallbackPngResponse(reason: string): Response {
  return new Response(TRANSPARENT_PNG, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "cache-control": "public, max-age=120",
      "x-img-proxy-fallback": reason.slice(0, 80),
    },
  });
}

async function fetchOnce(
  target: string,
  useReferer: boolean
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_MS);
  try {
    const origin = new URL(target).origin;
    const headers: Record<string, string> = {
      "User-Agent": IMAGE_UA,
      Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "Accept-Encoding": "identity",
    };
    if (useReferer) headers.Referer = `${origin}/`;
    return await fetch(target, {
      headers,
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

/** Several logo CDNs 403/close on a bad Referer; retry without it. */
async function fetchUpstream(target: string): Promise<Response | null> {
  let lastNotOk: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    for (const useReferer of [true, false]) {
      try {
        const upstream = await fetchOnce(target, useReferer);
        if (upstream.ok && upstream.body) return upstream;
        lastNotOk = upstream;
        if (upstream.status < 500) return upstream;
      } catch {
        /* try next variant */
      }
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  if (lastNotOk) return lastNotOk;
  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const target = url.searchParams.get("u");
  if (!target) return new Response("Missing 'u'", { status: 400 });

  let upstreamUrl: URL;
  try {
    upstreamUrl = new URL(target);
  } catch {
    return new Response("Bad URL", { status: 400 });
  }

  if (upstreamUrl.protocol !== "http:" && upstreamUrl.protocol !== "https:") {
    return new Response("Unsupported scheme", { status: 400 });
  }

  try {
    const upstream = await fetchUpstream(upstreamUrl.toString());
    if (!upstream || !upstream.ok || !upstream.body) {
      return fallbackPngResponse(
        !upstream || !upstream.ok ? "upstream-unavailable" : "empty-body"
      );
    }
    const headers = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) headers.set("content-type", ct);
    headers.set(
      "cache-control",
      "public, max-age=86400, stale-while-revalidate=604800"
    );
    return new Response(upstream.body, { status: 200, headers });
  } catch {
    return fallbackPngResponse("fetch-exception");
  }
}
