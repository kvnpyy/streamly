import { auth } from "@/auth";
import { getDb } from "@/db";
import { iptvProviderAccounts } from "@/db/schema";
import {
  attachSessionCookie,
  SessionCookieEncodeError,
} from "@/lib/auth-session-cookie";
import {
  decryptProviderCredentials,
  ProviderCryptoError,
} from "@/lib/provider-account-crypto";
import { authenticateXtreamPanel } from "@/lib/xtream-panel-auth";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

/** Decrypt saved Xtream creds, refresh playback cookie, validate upstream. */
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const rows = await getDb()
    .select()
    .from(iptvProviderAccounts)
    .where(
      and(eq(iptvProviderAccounts.id, id), eq(iptvProviderAccounts.userId, uid))
    )
    .limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let creds;
  try {
    creds = decryptProviderCredentials(uid, id, row.payload);
  } catch (e) {
    if (e instanceof ProviderCryptoError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }
  if (!creds) {
    return NextResponse.json(
      { error: "Could not decrypt stored credentials." },
      { status: 500 }
    );
  }

  let accountResponse;
  try {
    accountResponse = await authenticateXtreamPanel(creds);
  } catch {
    return NextResponse.json(
      { error: "Could not reach IPTV server with saved credentials." },
      { status: 502 }
    );
  }

  try {
    const res = NextResponse.json({ ok: true, account: accountResponse });
    attachSessionCookie(res, req, creds);
    await getDb()
      .update(iptvProviderAccounts)
      .set({ updatedAt: new Date() })
      .where(eq(iptvProviderAccounts.id, id));
    return res;
  } catch (e) {
    if (e instanceof SessionCookieEncodeError) {
      return NextResponse.json(
        {
          error:
            "Cannot set session cookie. Set STREAM_SESSION_SECRET (≥16 characters).",
        },
        { status: 503 }
      );
    }
    throw e;
  }
}
