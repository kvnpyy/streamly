/**
 * Public product name and copy — single place to rebrand or A/B later.
 * "Stream" alone is generic in search and app stores; a short compound name
 * reads more like a product and is easier to defend as a mark (not legal advice).
 */
export const SITE_NAME = "Streamly";
export const SITE_TAGLINE = "Your playlist. One calm player.";
export const SITE_DESCRIPTION =
  "Streamly is an IPTV web player for Xtream Codes and M3U playlists: live TV, movies, series, EPG, and TV-friendly controls in your browser. Sign in with your own provider — we don’t sell channels.";

/** Logged-in feedback (Typeform). Override for staging, e.g. a duplicate form. */
export const FEEDBACK_FORM_URL =
  process.env.NEXT_PUBLIC_FEEDBACK_FORM_URL?.trim() ||
  "https://form.typeform.com/to/e9haRFsv";

export const GITHUB_REPO_URL = "https://github.com/kvnpyy/streamly";

/** Pinned "Feedback & Ideas" thread — low-friction ideas without opening an issue. */
export const GITHUB_DISCUSSIONS_FEEDBACK_URL =
  process.env.NEXT_PUBLIC_GITHUB_DISCUSSIONS_FEEDBACK_URL?.trim() ||
  "https://github.com/kvnpyy/streamly/discussions/7";

const DEFAULT_DISCORD_INVITE_URL = "https://discord.gg/QGFKJt9t7A";

/** Public Discord invite — set empty in env to hide community links. */
export function discordInviteUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_DISCORD_INVITE_URL?.trim();
  if (raw === "") return null;
  if (raw) return raw;
  return DEFAULT_DISCORD_INVITE_URL;
}

/** Shown near login and checkout-style surfaces. */
export const USER_CONTENT_DISCLAIMER_SHORT =
  "Streamly does not provide channels or copyrighted content. You need your own subscription and must follow your provider’s terms and applicable law.";

/** Production host — used when `NEXT_PUBLIC_SITE_URL` is unset (canonical, OG, sitemap). */
export const DEFAULT_SITE_URL = "https://iptvwebplayer.org";

export function siteMetadataBase(): URL | undefined {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      return new URL(raw.endsWith("/") ? raw.slice(0, -1) : raw);
    } catch {
      /* fallthrough */
    }
  }
  if (process.env.VERCEL_URL) {
    try {
      return new URL(`https://${process.env.VERCEL_URL}`);
    } catch {
      /* fallthrough */
    }
  }
  try {
    return new URL(DEFAULT_SITE_URL);
  } catch {
    return undefined;
  }
}

export function absoluteSiteUrl(path = ""): string {
  const base = siteMetadataBase();
  if (!base) return path || "/";
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base.origin}${p}`;
}
