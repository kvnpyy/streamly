import { auth } from "@/auth";
import { getDb } from "@/db";
import { iptvProviderAccounts } from "@/db/schema";
import {
  clearUserActiveIptvProviderIfMatches,
  setUserActiveIptvProviderAccountId,
} from "@/lib/active-iptv-provider";
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
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

function normalizeServer(server: string): string {
  return server.trim().toLowerCase().replace(/\/+$/, "");
}

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase();
}

function credsMatch(a: XtreamCredentials, b: XtreamCredentials): boolean {
  return (
    normalizeServer(a.server) === normalizeServer(b.server) &&
    normalizeUsername(a.username) === normalizeUsername(b.username) &&
    a.password === b.password
  );
}

/** Return label + non-secret connection fields for the edit form. */
export async function GET(_req: NextRequest, ctx: RouteCtx) {
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

  return NextResponse.json({
    id: row.id,
    label: row.label,
    server: creds.server,
    username: creds.username,
  });
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const b = body as {
    label?: string;
    creds?: {
      server?: string;
      username?: string;
      password?: string;
    };
  };

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

  let existingCreds;
  try {
    existingCreds = decryptProviderCredentials(uid, id, row.payload);
  } catch (e) {
    if (e instanceof ProviderCryptoError) {
      return NextResponse.json({ error: e.message }, { status: 503 });
    }
    throw e;
  }
  if (!existingCreds) {
    return NextResponse.json(
      { error: "Could not decrypt stored credentials." },
      { status: 500 }
    );
  }

  const nextLabel =
    typeof b.label === "string" && b.label.trim()
      ? b.label.trim().slice(0, 120)
      : row.label;

  const hasCredsPatch = b.creds && typeof b.creds === "object";
  const nextCreds: XtreamCredentials = hasCredsPatch
    ? {
        server:
          typeof b.creds?.server === "string" && b.creds.server.trim()
            ? b.creds.server.trim()
            : existingCreds.server,
        username:
          typeof b.creds?.username === "string" && b.creds.username.trim()
            ? b.creds.username.trim()
            : existingCreds.username,
        password:
          typeof b.creds?.password === "string" && b.creds.password
            ? b.creds.password
            : existingCreds.password,
      }
    : existingCreds;

  if (!nextCreds.server.trim() || !nextCreds.username.trim()) {
    return NextResponse.json({ error: "Server and username are required." }, { status: 400 });
  }

  const labelChanged = nextLabel !== row.label;
  const credsChanged = !credsMatch(nextCreds, existingCreds);

  if (!labelChanged && !credsChanged) {
    return NextResponse.json({ ok: true });
  }

  let accountResponse;
  if (credsChanged) {
    try {
      accountResponse = await authenticateXtreamPanel(nextCreds);
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

    const normalizedServer = normalizeServer(nextCreds.server);
    const normalizedUsername = normalizeUsername(nextCreds.username);

    const siblingRows = await getDb()
      .select()
      .from(iptvProviderAccounts)
      .where(eq(iptvProviderAccounts.userId, uid));

    for (const sibling of siblingRows) {
      if (sibling.id === id) continue;
      const decoded = decryptProviderCredentials(uid, sibling.id, sibling.payload);
      if (!decoded) continue;
      if (
        normalizeServer(decoded.server) === normalizedServer &&
        normalizeUsername(decoded.username) === normalizedUsername
      ) {
        return NextResponse.json(
          { error: "Another saved playlist already uses this server and username." },
          { status: 409 }
        );
      }
    }
  }

  const now = new Date();
  const updates: {
    label?: string;
    payload?: string;
    updatedAt: Date;
  } = { updatedAt: now };

  if (labelChanged) {
    updates.label = nextLabel;
  }

  if (credsChanged) {
    try {
      updates.payload = encryptProviderCredentials(uid, id, nextCreds);
    } catch (e) {
      if (e instanceof ProviderCryptoError) {
        return NextResponse.json({ error: e.message }, { status: 503 });
      }
      throw e;
    }
  }

  await getDb()
    .update(iptvProviderAccounts)
    .set(updates)
    .where(
      and(eq(iptvProviderAccounts.id, id), eq(iptvProviderAccounts.userId, uid))
    );

  if (credsChanged) {
    await setUserActiveIptvProviderAccountId(uid, id);
    try {
      const res = NextResponse.json({
        ok: true,
        account: accountResponse,
      });
      attachSessionCookie(res, req, nextCreds);
      return res;
    } catch (e) {
      if (e instanceof SessionCookieEncodeError) {
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

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const rows = await getDb()
    .delete(iptvProviderAccounts)
    .where(
      and(eq(iptvProviderAccounts.id, id), eq(iptvProviderAccounts.userId, uid))
    )
    .returning({ id: iptvProviderAccounts.id });

  if (!rows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await clearUserActiveIptvProviderIfMatches(uid, id);
  return NextResponse.json({ ok: true });
}
