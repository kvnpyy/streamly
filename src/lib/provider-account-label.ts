/** Short label for a saved Xtream row (Settings + provider POST). */
export function providerLabelFromCreds(creds: {
  server: string;
  username: string;
}): string {
  try {
    const host = new URL(creds.server).hostname;
    return `${creds.username} · ${host}`;
  } catch {
    return `${creds.username} · IPTV`;
  }
}

/** Parse `get.php?username=…&password=…` style M3U portal URLs into Xtream creds. */
export function tryParseM3uPortalUrl(input: string): {
  server: string;
  username: string;
  password: string;
} | null {
  try {
    const u = new URL(input.trim());
    const username = u.searchParams.get("username");
    const password = u.searchParams.get("password");
    if (username !== null && password !== null) {
      return {
        server: `${u.protocol}//${u.host}`,
        username,
        password,
      };
    }
  } catch {
    /* fallthrough */
  }
  return null;
}
