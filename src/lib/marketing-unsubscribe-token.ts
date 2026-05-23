import { absoluteSiteUrl } from "@/lib/site-brand";
import { createHmac, timingSafeEqual } from "node:crypto";

function marketingSigningSecret(): string | null {
  const raw =
    process.env.AUTH_SECRET?.trim() ||
    process.env.STREAM_SESSION_SECRET?.trim();
  if (!raw || raw.length < 16) return null;
  return raw;
}

function signPayload(payload: string): string | null {
  const secret = marketingSigningSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(payload, "utf8").digest("base64url");
}

/** Long-lived signed token for one-click unsubscribe links in email footers. */
export function createMarketingUnsubscribeToken(userId: string): string | null {
  const sig = signPayload(userId);
  if (!sig) return null;
  const id = Buffer.from(userId, "utf8").toString("base64url");
  return `${id}.${sig}`;
}

export function verifyMarketingUnsubscribeToken(
  token: string
): string | null {
  const trimmed = token.trim();
  const dot = trimmed.lastIndexOf(".");
  if (dot <= 0) return null;
  const idPart = trimmed.slice(0, dot);
  const sigPart = trimmed.slice(dot + 1);
  if (!idPart || !sigPart) return null;

  let userId: string;
  try {
    userId = Buffer.from(idPart, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!userId) return null;

  const expected = signPayload(userId);
  if (!expected) return null;

  try {
    const a = Buffer.from(sigPart, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return null;
    if (!timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  return userId;
}

export function marketingUnsubscribeUrl(token: string): string {
  return absoluteSiteUrl(`/unsubscribe?token=${encodeURIComponent(token)}`);
}
