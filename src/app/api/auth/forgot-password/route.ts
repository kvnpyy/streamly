import { getDb } from "@/db";
import { users } from "@/db/schema";
import { issuePasswordResetEmail } from "@/lib/auth-password-reset-email";
import { RESEND_ENV_HINT, RESEND_UPSTREAM_HINT } from "@/lib/mail";
import { limitAuthRoute } from "@/lib/auth-rate-limit";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const limited = limitAuthRoute("forgot_password", ip);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Too many requests. Try again later." },
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
  if (typeof emailRaw !== "string") {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }
  const email = emailRaw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }

  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
    })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  const row = rows[0];
  if (row?.passwordHash) {
    const sent = await issuePasswordResetEmail(row.id, row.email);
    if (!sent.ok) {
      const detail =
        sent.reason === "missing_config" ? RESEND_ENV_HINT : RESEND_UPSTREAM_HINT;
      return NextResponse.json(
        { error: `Could not send email. ${detail}` },
        { status: 503 }
      );
    }
  }

  return NextResponse.json({
    ok: true,
    message:
      "If an account exists for that email, we sent reset instructions when possible.",
  });
}
