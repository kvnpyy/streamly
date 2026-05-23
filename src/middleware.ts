import {
  isAmazonSilkUserAgent,
  isTvClassUserAgent,
  STREAM_SILK_HEADER,
  STREAM_TV_HEADER,
} from "@/lib/tv-user-agent";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const ua = request.headers.get("user-agent") ?? "";
  const requestHeaders = new Headers(request.headers);
  if (isTvClassUserAgent(ua)) {
    requestHeaders.set(STREAM_TV_HEADER, "1");
  } else {
    requestHeaders.delete(STREAM_TV_HEADER);
  }
  if (isAmazonSilkUserAgent(ua)) {
    requestHeaders.set(STREAM_SILK_HEADER, "1");
  } else {
    requestHeaders.delete(STREAM_SILK_HEADER);
  }
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    /*
     * Exclude static assets — middleware should not run on chunks/images/fonts.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2|css|js)$).*)",
  ],
};
