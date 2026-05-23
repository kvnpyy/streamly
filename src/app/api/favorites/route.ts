import { auth } from "@/auth";
import { getDb } from "@/db";
import { userProviderFavorites } from "@/db/schema";
import {
  isValidProviderAccountKey,
  sanitizeFavorites,
} from "@/lib/favorites-sync";
import type { Favorite } from "@/store/preferences";
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

/**
 * Returns true when `err` is a SQLite foreign-key constraint failure.
 *
 * Root cause: JWT sessions are valid for 90 days. If the production DB is
 * ever reset or a user row is deleted, the old cookie is still cryptographically
 * valid — the session resolves to a `uid` that no longer exists in `users`.
 * Rather than crashing with a 500, we degrade gracefully: cloud sync is skipped
 * and the client falls back to local localStorage favorites.
 */
function isForeignKeyError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // better-sqlite3 attaches a `code` property
  const code = (err as Error & { code?: string }).code;
  return (
    code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
    err.message.includes("FOREIGN KEY")
  );
}

/** Load cloud favorites for the signed-in user + Xtream account key. */
export async function GET(req: NextRequest) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) return unauthorized();

  const accountKey = req.nextUrl.searchParams.get("accountKey")?.trim() ?? "";
  if (!isValidProviderAccountKey(accountKey)) {
    return badRequest("Invalid accountKey");
  }

  const rows = await getDb()
    .select({ favoritesJson: userProviderFavorites.favoritesJson })
    .from(userProviderFavorites)
    .where(
      and(
        eq(userProviderFavorites.userId, uid),
        eq(userProviderFavorites.providerAccountKey, accountKey)
      )
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return NextResponse.json({ favorites: [] as Favorite[] });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(row.favoritesJson);
  } catch {
    return NextResponse.json({ favorites: [] as Favorite[] });
  }

  return NextResponse.json({ favorites: sanitizeFavorites(parsed) });
}

/** Replace cloud favorites for the signed-in user + Xtream account key. */
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

  const b = body as { accountKey?: string; favorites?: unknown };
  const accountKey =
    typeof b.accountKey === "string" ? b.accountKey.trim() : "";
  if (!isValidProviderAccountKey(accountKey)) {
    return badRequest("Invalid accountKey");
  }

  const favorites = sanitizeFavorites(b.favorites);
  const now = new Date();

  try {
    await getDb()
      .insert(userProviderFavorites)
      .values({
        userId: uid,
        providerAccountKey: accountKey,
        favoritesJson: JSON.stringify(favorites),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          userProviderFavorites.userId,
          userProviderFavorites.providerAccountKey,
        ],
        set: {
          favoritesJson: JSON.stringify(favorites),
          updatedAt: now,
        },
      });
  } catch (err) {
    if (isForeignKeyError(err)) {
      // Stale JWT — user row no longer in DB. Skip cloud sync gracefully.
      return NextResponse.json(
        { ok: false, synced: false, reason: "user_not_found" },
        { status: 409 }
      );
    }
    throw err;
  }

  return NextResponse.json({ ok: true, favorites });
}
