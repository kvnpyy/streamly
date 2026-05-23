import { pingSqlite } from "@/db";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness + SQLite ping for deploy probes.
 * Does not call upstream IPTV (would require credentials and adds latency).
 */
export async function GET() {
  const database = pingSqlite();
  const ok = database;
  return NextResponse.json(
    {
      ok,
      database,
      /** UTC ISO timestamp */
      time: new Date().toISOString(),
    },
    { status: ok ? 200 : 503 }
  );
}
