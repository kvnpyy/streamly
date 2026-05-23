import "server-only";

import { getDb } from "@/db";
import { authTokens } from "@/db/schema";
import { generateAuthTokenPlain, hashAuthToken } from "@/lib/auth-token-secret";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

export const AUTH_PURPOSE_EMAIL_VERIFY = "email_verify";
export const AUTH_PURPOSE_PASSWORD_RESET = "password_reset";

export async function replaceAuthToken(opts: {
  userId: string;
  purpose: string;
  ttlMs: number;
}): Promise<string> {
  const db = getDb();
  await db
    .delete(authTokens)
    .where(
      and(eq(authTokens.userId, opts.userId), eq(authTokens.purpose, opts.purpose))
    );

  const plain = generateAuthTokenPlain();
  const now = Date.now();
  await db.insert(authTokens).values({
    id: randomUUID(),
    userId: opts.userId,
    purpose: opts.purpose,
    tokenHash: hashAuthToken(plain),
    expiresAt: new Date(now + opts.ttlMs),
    createdAt: new Date(now),
  });

  return plain;
}

/** Validates token, deletes row, returns user id. */
export async function consumeAuthToken(
  plain: string,
  purpose: string
): Promise<{ userId: string } | null> {
  const hash = hashAuthToken(plain);
  const db = getDb();
  const rows = await db
    .select()
    .from(authTokens)
    .where(eq(authTokens.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row || row.purpose !== purpose) return null;

  const exp =
    row.expiresAt instanceof Date
      ? row.expiresAt.getTime()
      : new Date(row.expiresAt).getTime();
  if (exp <= Date.now()) {
    await db.delete(authTokens).where(eq(authTokens.id, row.id));
    return null;
  }

  await db.delete(authTokens).where(eq(authTokens.id, row.id));
  return { userId: row.userId };
}

export async function deleteAuthTokensForUser(userId: string): Promise<void> {
  await getDb().delete(authTokens).where(eq(authTokens.userId, userId));
}
