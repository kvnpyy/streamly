import { getDb } from "@/db";
import { users } from "@/db/schema";
import { limitAuthRoute } from "@/lib/auth-rate-limit";
import {
  AUTH_PURPOSE_EMAIL_VERIFY,
  consumeAuthToken,
} from "@/lib/auth-tokens";
import { runPostVerificationMarketing } from "@/lib/marketing-on-verify";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const limited = limitAuthRoute("verify_email", ip, {
    windowMs: 600_000,
    maxRequests: 40,
  });
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Try again later." },
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
  const token = (body as { token?: string }).token;
  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  const consumed = await consumeAuthToken(
    token.trim(),
    AUTH_PURPOSE_EMAIL_VERIFY
  );
  if (!consumed) {
    return NextResponse.json(
      { error: "Invalid or expired verification link." },
      { status: 400 }
    );
  }

  const existing = await getDb()
    .select({ emailVerifiedAt: users.emailVerifiedAt })
    .from(users)
    .where(eq(users.id, consumed.userId))
    .limit(1);
  const wasVerified = existing[0]?.emailVerifiedAt != null;

  await getDb()
    .update(users)
    .set({ emailVerifiedAt: new Date() })
    .where(eq(users.id, consumed.userId));

  if (!wasVerified) {
    void runPostVerificationMarketing(consumed.userId).catch((err) => {
      console.error("[auth/verify-email] marketing", err);
    });
  }

  return NextResponse.json({ ok: true });
}
