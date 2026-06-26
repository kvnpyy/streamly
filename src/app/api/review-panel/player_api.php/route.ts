import { NextRequest, NextResponse } from "next/server";

import {
  isReviewPanelCreds,
  isReviewPanelEnabled,
  REVIEW_PANEL_PASSWORD,
  REVIEW_PANEL_USERNAME,
} from "@/lib/review-panel/credentials";
import { tryHandleReviewPanelRequest } from "@/lib/review-panel/handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Xtream-compatible panel endpoint for Samsung / store QA.
 * Server URL: https://iptvwebplayer.org/api/review-panel
 */
export async function GET(req: NextRequest) {
  if (!isReviewPanelEnabled()) {
    return NextResponse.json({ error: "Review panel disabled" }, { status: 404 });
  }

  const url = new URL(req.url);
  const username = url.searchParams.get("username")?.trim() ?? "";
  const password = url.searchParams.get("password")?.trim() ?? "";

  const origin = url.origin;
  const creds = {
    server: `${origin}/api/review-panel`,
    username,
    password,
  };

  if (!isReviewPanelCreds(creds)) {
    return NextResponse.json(
      {
        user_info: {
          username,
          password,
          auth: 0,
          status: "Disabled",
          message: "Invalid review credentials.",
        },
      },
      { status: 401 }
    );
  }

  const params: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) {
    params[k] = v;
  }

  const payload = tryHandleReviewPanelRequest(creds, params);
  return NextResponse.json(payload);
}

export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
