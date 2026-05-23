import { getDb } from "@/db";
import { users } from "@/db/schema";
import { issueEmailVerification } from "@/lib/auth-verification-email";
import { limitAuthRoute } from "@/lib/auth-rate-limit";
import { RESEND_ENV_HINT, RESEND_UPSTREAM_HINT } from "@/lib/mail";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** Create a Stream account (email + password). Sends verification email — sign-in requires a verified address. */
export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const limited = limitAuthRoute("register", ip);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many registration attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(limited.retryAfterSec) },
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const emailRaw = (body as { email?: string }).email;
  const password = (body as { password?: string }).password;
  const name = (body as { name?: string }).name;
  const marketingOptIn =
    (body as { marketingOptIn?: boolean }).marketingOptIn === true;

  if (typeof emailRaw !== "string" || typeof password !== "string") {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const existing = await getDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing.length > 0) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = randomUUID();
  const now = new Date();

  try {
    await getDb().insert(users).values({
      id,
      email,
      name:
        typeof name === "string" && name.trim()
          ? name.trim().slice(0, 80)
          : null,
      passwordHash,
      emailVerifiedAt: null,
      marketingOptIn,
      marketingOptInAt: marketingOptIn ? now : null,
      createdAt: now,
    });

    const mailed = await issueEmailVerification(id, email);
    if (!mailed.ok) {
      await getDb().delete(users).where(eq(users.id, id));
      const detail =
        mailed.reason === "missing_config" ? RESEND_ENV_HINT : RESEND_UPSTREAM_HINT;
      return NextResponse.json(
        {
          error: `Could not send the confirmation email. ${detail}`,
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { ok: true, needsVerification: true },
      { status: 201 }
    );
  } catch (err) {
    console.error("[auth/register]", err);
    try {
      await getDb().delete(users).where(eq(users.id, id));
    } catch {
      /* ignore cleanup errors */
    }

    const msg = err instanceof Error ? err.message : String(err);
    if (/unique|UNIQUE constraint/i.test(msg)) {
      return NextResponse.json(
        { error: "An account with this email already exists." },
        { status: 409 }
      );
    }
    if (/no such column|no such table|SQLITE_ERROR.*auth_tokens|email_verified/i.test(msg)) {
      return NextResponse.json(
        {
          error:
            "Database is missing the latest signup tables. On the VPS run: sudo -u stream -H bash -lc 'cd /opt/stream/iptv-player && npm run db:push' then sudo systemctl restart stream",
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: "Registration failed. Please try again in a moment." },
      { status: 500 }
    );
  }
}
