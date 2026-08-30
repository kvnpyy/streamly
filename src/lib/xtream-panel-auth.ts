import "server-only";

import { tryHandleReviewPanelRequest } from "@/lib/review-panel/handler";
import type { AuthResponse, XtreamCredentials } from "@/lib/xtream-types";
import { normalizeServer } from "@/lib/utils";
import { fetchXtreamPanelWithRetry } from "@/lib/xtream-upstream-fetch";

const XTREAM_UA =
  "Mozilla/5.0 (Linux; Android 9; SM-G960F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 IPTVSmartersPlayer/3.1.5";

/**
 * Authenticate directly against the user&apos;s Xtream panel (server-side).
 * Used by API routes so we don't require Turnstile on internal hops through `/api/xtream`.
 */
export async function authenticateXtreamPanel(
  creds: XtreamCredentials,
  signal?: AbortSignal
): Promise<AuthResponse> {
  const review = tryHandleReviewPanelRequest(creds, {});
  if (review) {
    return review as AuthResponse;
  }

  const server = normalizeServer(creds.server);
  const upstream = new URL(`${server}/player_api.php`);
  if (upstream.hostname === "localhost" || upstream.hostname === "127.0.0.1") {
    upstream.port = process.env.PORT || "3000";
  }
  upstream.searchParams.set("username", creds.username);
  upstream.searchParams.set("password", creds.password);

  const res = await fetchXtreamPanelWithRetry(
    upstream.toString(),
    {
      method: "GET",
      headers: {
        "User-Agent": XTREAM_UA,
        Accept: "application/json,text/plain,*/*",
      },
      cache: "no-store",
      signal: signal ?? AbortSignal.timeout(35_000),
    }
  );

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Xtream panel HTTP ${res.status}`);
  }

  let json: AuthResponse;
  try {
    json = JSON.parse(text) as AuthResponse;
  } catch {
    throw new Error("Xtream panel returned non-JSON");
  }
  return json;
}
