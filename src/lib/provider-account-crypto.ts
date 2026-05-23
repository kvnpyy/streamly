import type { XtreamCredentials } from "@/lib/xtream-types";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const PREFIX = "p1.";

export class ProviderCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderCryptoError";
  }
}

function devFallbackKey(userId: string, accountId: string): Buffer {
  return createHash("sha256")
    .update(`iptv-provider-dev|${userId}|${accountId}`, "utf8")
    .digest();
}

/** Prefer dedicated secret; fall back to session secret for single-key installs. */
function secretRaw(): string | undefined {
  const p = process.env.STREAM_PROVIDER_CREDENTIALS_SECRET?.trim();
  if (p && p.length >= 16) return p;
  const s = process.env.STREAM_SESSION_SECRET?.trim();
  if (s && s.length >= 16) return s;
  return undefined;
}

function deriveKey(secret: string, userId: string, accountId: string): Buffer {
  return createHash("sha256")
    .update(`${secret}|${userId}|${accountId}`, "utf8")
    .digest();
}

export function getProviderEncryptKey(
  userId: string,
  accountId: string
): Buffer {
  const secret = secretRaw();
  if (secret) return deriveKey(secret, userId, accountId);
  if (process.env.NODE_ENV === "production") {
    throw new ProviderCryptoError(
      "STREAM_PROVIDER_CREDENTIALS_SECRET or STREAM_SESSION_SECRET (≥16 chars) required to store IPTV accounts."
    );
  }
  return devFallbackKey(userId, accountId);
}

export function encryptProviderCredentials(
  userId: string,
  accountId: string,
  creds: XtreamCredentials
): string {
  const trimmed: XtreamCredentials = {
    server: creds.server.trim(),
    username: creds.username.trim(),
    password: creds.password,
  };
  const key = getProviderEncryptKey(userId, accountId);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plain = JSON.stringify(trimmed);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, enc]);
  return PREFIX + packed.toString("base64url");
}

export function decryptProviderCredentials(
  userId: string,
  accountId: string,
  blob: string
): XtreamCredentials | null {
  if (!blob.startsWith(PREFIX)) return null;
  try {
    const key = getProviderEncryptKey(userId, accountId);
    const buf = Buffer.from(blob.slice(PREFIX.length), "base64url");
    if (buf.length < 12 + 16 + 1) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]).toString(
      "utf8"
    );
    const o = JSON.parse(plain) as XtreamCredentials;
    if (
      o &&
      typeof o.server === "string" &&
      typeof o.username === "string" &&
      typeof o.password === "string"
    ) {
      return {
        server: o.server.trim(),
        username: o.username.trim(),
        password: o.password,
      };
    }
  } catch {
    /* noop */
  }
  return null;
}
