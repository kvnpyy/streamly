import {
  detectRegionFromCountryCode,
  defaultVodLanguageForRegion,
} from "@/lib/geo-continent";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

/**
 * Resolve viewer region from CDN / hosting geo headers (Vercel, Cloudflare).
 * Client falls back to browser timezone when country is unknown.
 */
export async function GET(req: NextRequest) {
  const country =
    req.headers.get("x-vercel-ip-country") ??
    req.headers.get("cf-ipcountry") ??
    null;

  const region = detectRegionFromCountryCode(country);
  const language = region ? defaultVodLanguageForRegion(region) : null;

  return NextResponse.json({
    country,
    region,
    language,
  });
}
