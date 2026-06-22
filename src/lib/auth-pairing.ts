/**
 * One-time TV linking PINs (SQLite-backed). Survives restarts and works across
 * multiple Node processes when they share the same DATABASE_URL file.
 */

import { getDb } from "@/db";
import { tvPairCodes, tvPairRedeemBuckets } from "@/db/schema";
import {
  decodeSessionCookiePayload,
  encodeSessionCookiePayload,
} from "@/lib/auth-session-cookie";
import type { XtreamCredentials } from "@/lib/xtream-types";
import { randomInt } from "node:crypto";
import { asc, count, eq, lt } from "drizzle-orm";

export type PairEntry = {
  creds: XtreamCredentials;
  expiresAt: number;
};

/** Default 10 minutes */
export const PAIR_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 400;

const REDEEM_WINDOW_MS = 15 * 60 * 1000;
const REDEEM_MAX_PER_WINDOW = 24;

function trimCreds(creds: XtreamCredentials): XtreamCredentials {
  return {
    server: creds.server.trim(),
    username: creds.username.trim(),
    password: creds.password,
  };
}

async function sweepExpiredPins(): Promise<void> {
  const db = getDb();
  const now = new Date();
  await db.delete(tvPairCodes).where(lt(tvPairCodes.expiresAt, now));

  const row = await db.select({ total: count() }).from(tvPairCodes).get();
  const total = row?.total ?? 0;
  if (total <= MAX_ENTRIES) return;

  const trim = total - MAX_ENTRIES + 50;
  const oldest = await db
    .select({ pin: tvPairCodes.pin })
    .from(tvPairCodes)
    .orderBy(asc(tvPairCodes.expiresAt))
    .limit(trim)
    .all();
  for (const { pin } of oldest) {
    await db.delete(tvPairCodes).where(eq(tvPairCodes.pin, pin));
  }
}

/** Returns a 6-digit PIN string. */
export async function issuePairCode(
  creds: XtreamCredentials,
  ttlMs = PAIR_TTL_MS
): Promise<string> {
  await sweepExpiredPins();
  const db = getDb();
  const expiresAt = new Date(Date.now() + ttlMs);
  const payload = encodeSessionCookiePayload(trimCreds(creds));
  const createdAt = new Date();

  let pin: string;
  let guard = 0;
  do {
    pin = String(randomInt(100_000, 1_000_000));
    guard++;
    if (guard > 30) {
      await sweepExpiredPins();
      guard = 0;
    }
  } while (await db.select().from(tvPairCodes).where(eq(tvPairCodes.pin, pin)).get());

  await db.insert(tvPairCodes).values({ pin, payload, expiresAt, createdAt });
  return pin;
}

export async function redeemPairCode(pinRaw: string): Promise<XtreamCredentials | null> {
  await sweepExpiredPins();
  const pin = pinRaw.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) return null;

  const db = getDb();
  const entry = await db.select().from(tvPairCodes).where(eq(tvPairCodes.pin, pin)).get();
  if (!entry || entry.expiresAt.getTime() <= Date.now()) {
    if (entry) await db.delete(tvPairCodes).where(eq(tvPairCodes.pin, pin));
    return null;
  }

  await db.delete(tvPairCodes).where(eq(tvPairCodes.pin, pin));
  return decodeSessionCookiePayload(entry.payload);
}

export async function pairingRedeemAllowed(ip: string): Promise<boolean> {
  const now = Date.now();
  const db = getDb();
  const bucket = await db
    .select()
    .from(tvPairRedeemBuckets)
    .where(eq(tvPairRedeemBuckets.ip, ip))
    .get();

  if (!bucket || bucket.resetAt.getTime() <= now) {
    await db
      .insert(tvPairRedeemBuckets)
      .values({
        ip,
        count: 1,
        resetAt: new Date(now + REDEEM_WINDOW_MS),
      })
      .onConflictDoUpdate({
        target: tvPairRedeemBuckets.ip,
        set: {
          count: 1,
          resetAt: new Date(now + REDEEM_WINDOW_MS),
        },
      });
    return true;
  }

  if (bucket.count >= REDEEM_MAX_PER_WINDOW) return false;

  await db
    .update(tvPairRedeemBuckets)
    .set({ count: bucket.count + 1 })
    .where(eq(tvPairRedeemBuckets.ip, ip));
  return true;
}

/** @internal Vitest only — clears redeem rate-limit buckets. */
export async function __clearPairingRedeemBucketsForTests(): Promise<void> {
  await getDb().delete(tvPairRedeemBuckets);
}
