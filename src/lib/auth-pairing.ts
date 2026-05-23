/**
 * One-time TV linking PINs (in-memory). Single Node process only — not for multi-instance/serverless.
 */

import { randomInt } from "node:crypto";
import type { XtreamCredentials } from "@/lib/xtream-types";

export type PairEntry = {
  creds: XtreamCredentials;
  expiresAt: number;
};

const store = new Map<string, PairEntry>();

/** Default 10 minutes */
export const PAIR_TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 400;

function sweep(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.expiresAt <= now) store.delete(k);
  }
  if (store.size <= MAX_ENTRIES) return;
  const sorted = [...store.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt);
  const trim = store.size - MAX_ENTRIES + 50;
  for (let i = 0; i < trim && i < sorted.length; i++) {
    store.delete(sorted[i][0]);
  }
}

/** Returns a 6-digit PIN string. */
export function issuePairCode(creds: XtreamCredentials, ttlMs = PAIR_TTL_MS): string {
  sweep();
  let pin: string;
  let guard = 0;
  do {
    pin = String(randomInt(100_000, 1_000_000));
    guard++;
    if (guard > 30) {
      sweep();
      guard = 0;
    }
  } while (store.has(pin));

  store.set(pin, {
    creds: {
      server: creds.server.trim(),
      username: creds.username.trim(),
      password: creds.password,
    },
    expiresAt: Date.now() + ttlMs,
  });
  return pin;
}

export function redeemPairCode(pinRaw: string): XtreamCredentials | null {
  sweep();
  const pin = pinRaw.replace(/\D/g, "").slice(0, 6);
  if (pin.length !== 6) return null;
  const entry = store.get(pin);
  if (!entry || entry.expiresAt <= Date.now()) {
    store.delete(pin);
    return null;
  }
  store.delete(pin);
  return entry.creds;
}

type Bucket = { count: number; resetAt: number };
const redeemBuckets = new Map<string, Bucket>();
const REDEEM_WINDOW_MS = 15 * 60 * 1000;
const REDEEM_MAX_PER_WINDOW = 24;

export function pairingRedeemAllowed(ip: string): boolean {
  const now = Date.now();
  let b = redeemBuckets.get(ip);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + REDEEM_WINDOW_MS };
    redeemBuckets.set(ip, b);
  }
  if (b.count >= REDEEM_MAX_PER_WINDOW) return false;
  b.count++;
  return true;
}
