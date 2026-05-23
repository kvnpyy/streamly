import type { NextRequest } from "next/server";

/** Best-effort client IP for rate limits (trust your reverse proxy headers only on your own network). */
export function clientIpFromRequest(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return req.headers.get("cf-connecting-ip")?.trim() || "unknown";
}
