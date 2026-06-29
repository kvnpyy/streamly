import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { recordIptvApiError } from "@/lib/iptv-api-error-metrics";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { normalizeServer } from "@/lib/utils";

/** Read Xtream creds from inbound proxy headers (`x-iptv-*`). */
export function readIptvCredsFromRequest(
  req: NextRequest
): XtreamCredentials | null {
  const serverRaw = req.headers.get("x-iptv-server");
  const username = req.headers.get("x-iptv-username");
  const password = req.headers.get("x-iptv-password");
  if (!serverRaw?.trim() || !username?.trim() || password === null) return null;
  return {
    server: normalizeServer(serverRaw),
    username: username.trim(),
    password,
  };
}

/** Like {@link readIptvCredsFromRequest} but records metrics and returns a 400 response when missing. */
export function requireIptvCredsFromRequest(
  req: NextRequest
): XtreamCredentials | NextResponse {
  const creds = readIptvCredsFromRequest(req);
  if (!creds) {
    recordIptvApiError("missing_credentials");
    return NextResponse.json({ error: "Missing credentials" }, { status: 400 });
  }
  return creds;
}
