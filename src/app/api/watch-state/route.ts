import { auth } from "@/auth";
import { getDb } from "@/db";
import { userProviderWatchState } from "@/db/schema";
import { isValidProviderAccountKey } from "@/lib/favorites-sync";
import {
  sanitizeRecents,
  sanitizeVodResumeSec,
} from "@/lib/watch-state-sync";
import type { RecentItem } from "@/store/preferences";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function isForeignKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const code = (err as Error & { code?: string }).code;
  return (
    code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
    err.message.includes("FOREIGN KEY")
  );
}

export async function GET(req: NextRequest) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return unauthorized();

  const accountKey = req.nextUrl.searchParams.get("accountKey")?.trim() ?? "";
  if (!isValidProviderAccountKey(accountKey)) {
    return badRequest("Invalid accountKey");
  }

  const rows = await getDb()
    .select({
      recentsJson: userProviderWatchState.recentsJson,
      vodResumeJson: userProviderWatchState.vodResumeJson,
    })
    .from(userProviderWatchState)
    .where(
      and(
        eq(userProviderWatchState.userId, uid),
        eq(userProviderWatchState.providerAccountKey, accountKey)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({
      recents: [] as RecentItem[],
      vodResumeSec: {} as Record<string, number>,
    });
  }

  let recentsParsed: unknown;
  let vodParsed: unknown;
  try {
    recentsParsed = JSON.parse(row.recentsJson);
  } catch {
    recentsParsed = [];
  }
  try {
    vodParsed = JSON.parse(row.vodResumeJson);
  } catch {
    vodParsed = {};
  }

  return NextResponse.json({
    recents: sanitizeRecents(recentsParsed),
    vodResumeSec: sanitizeVodResumeSec(vodParsed),
  });
}

export async function PUT(req: NextRequest) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON");
  }

  const b = body as {
    accountKey?: string;
    recents?: unknown;
    vodResumeSec?: unknown;
  };
  const accountKey =
    typeof b.accountKey === "string" ? b.accountKey.trim() : "";
  if (!isValidProviderAccountKey(accountKey)) {
    return badRequest("Invalid accountKey");
  }

  const recents = sanitizeRecents(b.recents);
  const vodResumeSec = sanitizeVodResumeSec(b.vodResumeSec);
  const now = new Date();

  try {
    await getDb()
      .insert(userProviderWatchState)
      .values({
        userId: uid,
        providerAccountKey: accountKey,
        recentsJson: JSON.stringify(recents),
        vodResumeJson: JSON.stringify(vodResumeSec),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          userProviderWatchState.userId,
          userProviderWatchState.providerAccountKey,
        ],
        set: {
          recentsJson: JSON.stringify(recents),
          vodResumeJson: JSON.stringify(vodResumeSec),
          updatedAt: now,
        },
      });
  } catch (err) {
    if (isForeignKeyError(err)) {
      return NextResponse.json(
        { ok: false, synced: false, reason: "user_not_found" },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true, recents, vodResumeSec });
}
