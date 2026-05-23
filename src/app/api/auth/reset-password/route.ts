import { getDb } from "@/db";
import { users } from "@/db/schema";
import { limitAuthRoute } from "@/lib/auth-rate-limit";
import {
  AUTH_PURPOSE_PASSWORD_RESET,
  consumeAuthToken,
  deleteAuthTokensForUser,
} from "@/lib/auth-tokens";
import { clientIpFromRequest } from "@/lib/request-client-ip";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const limited = limitAuthRoute("reset_password", ip, {
    windowMs: 600_000,
    maxRequests: 20,
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
  const password = (body as { password?: string }).password;
  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }
  if (typeof password !== "string") {
    return NextResponse.json({ error: "Password is required." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }

  const consumed = await consumeAuthToken(
    token.trim(),
    AUTH_PURPOSE_PASSWORD_RESET
  );
  if (!consumed) {
    return NextResponse.json(
      { error: "Invalid or expired reset link." },
      { status: 400 }
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await getDb()
    .update(users)
    .set({ passwordHash })
    .where(eq(users.id, consumed.userId));
  await deleteAuthTokensForUser(consumed.userId);

  return NextResponse.json({ ok: true });
}
