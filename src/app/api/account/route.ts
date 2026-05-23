import { auth } from "@/auth";
import { getDb } from "@/db";
import { iptvProviderAccounts, users } from "@/db/schema";
import { SESSION_COOKIE_NAME } from "@/lib/auth-session-cookie";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Permanently delete the signed-in Stream user, encrypted IPTV rows (cascade),
 * and the guest IPTV session cookie. NextAuth JWT must be cleared on the client
 * via `signOut()` after this succeeds.
 */
export async function DELETE() {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getDb();
  await db
    .delete(iptvProviderAccounts)
    .where(eq(iptvProviderAccounts.userId, uid));
  await db.delete(users).where(eq(users.id, uid));

  const jar = await cookies();
  jar.delete(SESSION_COOKIE_NAME);

  return NextResponse.json({ ok: true });
}
