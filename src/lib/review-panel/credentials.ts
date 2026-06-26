import { timingSafeEqual } from "node:crypto";

/** Primary QA login (alias for parallel account 1). */
export const REVIEW_PANEL_USERNAME =
  process.env.REVIEW_PANEL_USERNAME?.trim() || "samsung_review";

export const REVIEW_PANEL_PASSWORD =
  process.env.REVIEW_PANEL_PASSWORD?.trim() || "StreamlyReview2026";

/**
 * Samsung tests all model groups in parallel — one distinct username per group.
 * Same password and playlist for every account (no ads / premium tiers in Streamly).
 */
export const REVIEW_PANEL_PARALLEL_ACCOUNTS = 12;

const REVIEW_USERNAME_RE = /^samsung_review(?:_(\d+))?$/;

/** Xtream server field reviewers enter on the TV login screen. */
export function reviewPanelServerUrl(siteOrigin?: string): string {
  const fromEnv = process.env.REVIEW_PANEL_SERVER_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const site =
    siteOrigin?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    "https://iptvwebplayer.org";
  return `${site.replace(/\/+$/, "")}/api/review-panel`;
}

export function normalizeReviewServer(server: string): string {
  return server.trim().replace(/\/+$/, "").toLowerCase();
}

function passwordsEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  try {
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

export function isReviewPanelEnabled(): boolean {
  return process.env.REVIEW_PANEL_ENABLED !== "false";
}

export function isReviewPanelServer(server: string): boolean {
  const s = normalizeReviewServer(server);
  if (s.endsWith("/api/review-panel")) return true;
  if (s.endsWith("/api/review-panel/player_api.php")) return true;
  return false;
}

/** `samsung_review` or `samsung_review_1` … `samsung_review_12` (extendable). */
export function isReviewPanelUsername(username: string): boolean {
  const u = username.trim();
  const m = REVIEW_USERNAME_RE.exec(u);
  if (!m) return false;
  if (m[1] === undefined) return true;
  const n = Number(m[1]);
  return Number.isInteger(n) && n >= 1 && n <= 20;
}

export function reviewPanelUsernameForSlot(slot: number): string {
  if (slot <= 1) return "samsung_review";
  return `samsung_review_${slot}`;
}

export function listReviewPanelUsernames(count = REVIEW_PANEL_PARALLEL_ACCOUNTS): string[] {
  const n = Math.max(1, Math.min(count, 20));
  return Array.from({ length: n }, (_, i) => reviewPanelUsernameForSlot(i + 1));
}

export function isReviewPanelCreds(creds: {
  server: string;
  username: string;
  password: string;
}): boolean {
  if (!isReviewPanelEnabled()) return false;
  if (!isReviewPanelServer(creds.server)) return false;
  return (
    isReviewPanelUsername(creds.username) &&
    passwordsEqual(creds.password.trim(), REVIEW_PANEL_PASSWORD)
  );
}
