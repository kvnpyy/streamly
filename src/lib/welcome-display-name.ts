/**
 * Greeting label for home / TV hub — prefer Stream profile name over IPTV login.
 */

export type WelcomeDisplayNameInput = {
  /** Stream account display name from registration (users.name). */
  streamName?: string | null;
  /** Stream account email — used for a readable fallback before IPTV username. */
  streamEmail?: string | null;
  /** Xtream panel username (often random). */
  iptvUsername: string;
};

function firstTokenFromEmail(email: string): string | null {
  const local = email.trim().split("@")[0]?.trim();
  if (!local) return null;
  const token = local.split(/[._+-]/)[0]?.trim();
  if (!token || token.length < 2) return null;
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

/** Panel logins like `ca6517ba` — not useful in a greeting. */
function looksLikeRandomIptvLogin(username: string): boolean {
  const t = username.trim();
  if (t.length < 6) return false;
  if (/^[a-f0-9]{8,}$/i.test(t)) return true;
  if (/^[a-z]{1,3}\d{4,}[a-z0-9]*$/i.test(t)) return true;
  return false;
}

/** Name shown in "Hey …" — never prefer a random-looking IPTV login when Stream identity exists. */
export function welcomeDisplayName(input: WelcomeDisplayNameInput): string {
  const name = input.streamName?.trim();
  if (name) return name;

  const fromEmail = input.streamEmail
    ? firstTokenFromEmail(input.streamEmail)
    : null;
  if (fromEmail) return fromEmail;

  const iptv = input.iptvUsername.trim();
  if (!iptv || looksLikeRandomIptvLogin(iptv)) return "there";
  return iptv;
}
