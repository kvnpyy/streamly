import { auth } from "@/auth";
import { getDb } from "@/db";
import { iptvProviderAccounts, users } from "@/db/schema";
import {
  attachSessionCookie,
  SessionCookieEncodeError,
} from "@/lib/auth-session-cookie";
import {
  decryptProviderCredentials,
  encryptProviderCredentials,
  ProviderCryptoError,
} from "@/lib/provider-account-crypto";
import { authenticateXtreamPanel } from "@/lib/xtream-panel-auth";
import { recordIptvApiError } from "@/lib/iptv-api-error-metrics";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const uidOrRes = await requireStreamUserId(session?.user?.id);
  if (uidOrRes instanceof NextResponse) return uidOrRes;
  const uid = uidOrRes;

  const rows = await getDb()
    .select({
      id: iptvProviderAccounts.id,
      label: iptvProviderAccounts.label,
      createdAt: iptvProviderAccounts.createdAt,
    })
    .from(iptvProviderAccounts)
    .where(eq(iptvProviderAccounts.userId, uid))
    .orderBy(desc(iptvProviderAccounts.updatedAt));

  return NextResponse.json({ accounts: rows });
}

async function requireStreamUserId(
  uid: string | undefined
): Promise<NextResponse | string> {
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const row = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);
  if (!row[0]) {
    return NextResponse.json(
      { error: "Session expired. Please sign in again." },
      { status: 401 }
    );
  }
  return uid;
}

/** Verify Xtream creds, encrypt at rest, save, and set playback cookie. */
export async function POST(req: NextRequest) {
  const session = await auth();
  const uidOrRes = await requireStreamUserId(session?.user?.id);
  if (uidOrRes instanceof NextResponse) return uidOrRes;
  const uid = uidOrRes;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body as {
    label?: string;
    creds?: XtreamCredentials;
  };
  const creds = b.creds;
  const label =
    typeof b.label === "string" && b.label.trim()
      ? b.label.trim().slice(0, 120)
      : "IPTV provider";

  if (
    !creds ||
    typeof creds.server !== "string" ||
    typeof creds.username !== "string" ||
    typeof creds.password !== "string"
  ) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 400 });
  }

  let accountResponse;
  try {
    accountResponse = await authenticateXtreamPanel(creds);
  } catch {
    recordIptvApiError("provider_verify_failed");
    return NextResponse.json(
      { error: "Could not verify credentials with your IPTV server." },
      { status: 502 }
    );
  }

  if (!accountResponse?.user_info || accountResponse.user_info.auth !== 1) {
    return NextResponse.json(
      {
        error:
          accountResponse?.user_info?.message ||
          "Login rejected by IPTV server.",
      },
      { status: 401 }
    );
  }

  const normalizedServer = creds.server.trim().toLowerCase().replace(/\/+$/, "");
  const normalizedUsername = creds.username.trim().toLowerCase();

  // Deduplicate: check if a row already exists for this server+username combo.
  const existingRows = await getDb()
    .select()
    .from(iptvProviderAccounts)
    .where(eq(iptvProviderAccounts.userId, uid));

  let existingId: string | null = null;
  for (const row of existingRows) {
    const decoded = decryptProviderCredentials(uid, row.id, row.payload);
    if (!decoded) continue;
    if (
      decoded.server.trim().toLowerCase().replace(/\/+$/, "") === normalizedServer &&
      decoded.username.trim().toLowerCase() === normalizedUsername
    ) {
      existingId = row.id;
      break;
    }
  }

  const now = new Date();

  if (existingId) {
    // Update the existing row (password may have changed; refresh payload).
    let updatedPayload: string;
    try {
      updatedPayload = encryptProviderCredentials(uid, existingId, creds);
    } catch (e) {
      if (e instanceof ProviderCryptoError) {
        return NextResponse.json({ error: e.message }, { status: 503 });
      }
      throw e;
    }
    await getDb()
      .update(iptvProviderAccounts)
      .set({ payload: updatedPayload, updatedAt: now })
      .where(eq(iptvProviderAccounts.id, existingId));

    try {
      const res = NextResponse.json({ id: existingId, label, account: accountResponse });
      attachSessionCookie(res, req, creds);
      return res;
    } catch (e) {
      if (e instanceof SessionCookieEncodeError) {
        return NextResponse.json(
          { error: "Server cannot set playback session cookie. Set STREAM_SESSION_SECRET (≥16 characters)." },
          { status: 503 }
        );
      }
      throw e;
    }
  }

  const id = randomUUID();
  let payload: string;
  try {
    payload = encryptProviderCredentials(uid, id, creds);
  } catch (e) {
    if (e instanceof ProviderCryptoError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }

  try {
    await getDb().insert(iptvProviderAccounts).values({
      id,
      userId: uid,
      label,
      payload,
      createdAt: now,
      updatedAt: now,
    });
  } catch (e) {
    if (
      e instanceof Error &&
      ((e as Error & { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
        e.message.includes("FOREIGN KEY"))
    ) {
      // Stale JWT — user row no longer in DB. Tell client to re-authenticate.
      return NextResponse.json(
        { error: "Session expired. Please sign in again." },
        { status: 409 }
      );
    }
    throw e;
  }

  try {
    const res = NextResponse.json({
      id,
      label,
      account: accountResponse,
    });
    attachSessionCookie(res, req, creds);
    return res;
  } catch (e) {
    if (e instanceof SessionCookieEncodeError) {
      await getDb().delete(iptvProviderAccounts).where(eq(iptvProviderAccounts.id, id));
      return NextResponse.json(
        {
          error:
            "Server cannot set playback session cookie. Set STREAM_SESSION_SECRET (≥16 characters).",
        },
        { status: 503 }
      );
    }
    throw e;
  }
}
