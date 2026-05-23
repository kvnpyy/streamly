import type { XtreamCredentials } from "@/lib/xtream-types";
import type { NextRequest, NextResponse } from "next/server";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const SESSION_COOKIE_NAME = "iptv-auth-sess";
/** ~90 days */
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 90;

/** v2.: AES-256-GCM encrypted JSON `{ creds }` — opaque without STREAM_SESSION_SECRET */
export const SESSION_COOKIE_V2_PREFIX = "v2.";

export class SessionCookieEncodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionCookieEncodeError";
  }
}

function devFallbackKey(): Buffer {
  return createHash("sha256")
    .update("iptv-stream-dev-session-insecure-do-not-use-in-prod", "utf8")
    .digest();
}

function sessionSecretRaw(): string | undefined {
  return process.env.STREAM_SESSION_SECRET?.trim();
}

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Key for **encrypting** new cookies. Production requires STREAM_SESSION_SECRET (≥16 chars).
 */
export function getSessionCryptoKey(): Buffer {
  const secret = sessionSecretRaw();
  if (secret && secret.length >= 16) {
    return deriveKey(secret);
  }
  if (process.env.NODE_ENV === "production") {
    throw new SessionCookieEncodeError(
      "STREAM_SESSION_SECRET must be set (at least 16 characters) in production to issue encrypted sessions."
    );
  }
  return devFallbackKey();
}

/**
 * Key for **decrypting** v2 cookies. If production has no secret, v2 blobs cannot be opened (null).
 */
export function getSessionCryptoKeyForDecrypt(): Buffer | null {
  const secret = sessionSecretRaw();
  if (secret && secret.length >= 16) {
    return deriveKey(secret);
  }
  if (process.env.NODE_ENV === "production") {
    return null;
  }
  return devFallbackKey();
}

function encryptAes256Gcm(plaintextUtf8: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([
    cipher.update(plaintextUtf8, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, enc]);
  return SESSION_COOKIE_V2_PREFIX + packed.toString("base64url");
}

function decryptAes256Gcm(b64urlPayload: string, key: Buffer): string | null {
  try {
    const buf = Buffer.from(b64urlPayload, "base64url");
    if (buf.length < 12 + 16 + 1) return null;
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const enc = buf.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
    return plain.toString("utf8");
  } catch {
    return null;
  }
}

export function parseCredentialsFromSessionJson(
  jsonText: string
): XtreamCredentials | null {
  try {
    const o = JSON.parse(jsonText) as { creds?: XtreamCredentials };
    const c = o.creds;
    if (
      c &&
      typeof c.server === "string" &&
      typeof c.username === "string" &&
      typeof c.password === "string"
    ) {
      return {
        server: c.server.trim(),
        username: c.username.trim(),
        password: c.password,
      };
    }
  } catch {
    /* noop */
  }
  return null;
}

function decodeLegacyPlainCookie(raw: string): XtreamCredentials | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    return parseCredentialsFromSessionJson(json);
  } catch {
    return null;
  }
}

/** Plain base64url JSON — migration only; prefer encrypted v2 for new cookies */
export function encodeLegacyPlainSessionCookie(
  creds: XtreamCredentials
): string {
  const trimmed: XtreamCredentials = {
    server: creds.server.trim(),
    username: creds.username.trim(),
    password: creds.password,
  };
  return Buffer.from(JSON.stringify({ creds: trimmed }), "utf8").toString(
    "base64url"
  );
}

export function encodeSessionCookiePayload(creds: XtreamCredentials): string {
  const trimmed: XtreamCredentials = {
    server: creds.server.trim(),
    username: creds.username.trim(),
    password: creds.password,
  };
  const key = getSessionCryptoKey();
  const json = JSON.stringify({ creds: trimmed });
  return encryptAes256Gcm(json, key);
}

export function decodeSessionCookiePayload(raw: string): XtreamCredentials | null {
  if (!raw || raw.length < 4) return null;
  if (raw.startsWith(SESSION_COOKIE_V2_PREFIX)) {
    const key = getSessionCryptoKeyForDecrypt();
    if (!key) return null;
    const plain = decryptAes256Gcm(
      raw.slice(SESSION_COOKIE_V2_PREFIX.length),
      key
    );
    if (!plain) return null;
    return parseCredentialsFromSessionJson(plain);
  }
  return decodeLegacyPlainCookie(raw);
}

export function sessionCookieOptions(req: NextRequest) {
  const proto =
    req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "");
  const secure = proto === "https";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}

export function attachSessionCookie(
  res: NextResponse,
  req: NextRequest,
  creds: XtreamCredentials
): void {
  const encoded = encodeSessionCookiePayload(creds);
  res.cookies.set(SESSION_COOKIE_NAME, encoded, sessionCookieOptions(req));
}
