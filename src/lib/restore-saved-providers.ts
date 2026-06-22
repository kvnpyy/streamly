/**
 * Client helpers for restoring saved IPTV provider accounts on a new device.
 */

import type { XtreamCredentials } from "@/lib/xtream-types";

export type SavedProviderAccountListItem = { id: string };

/** Pick which saved account to activate (pref wins when still valid, else most recent). */
export function pickSavedProviderAccountId(
  accounts: SavedProviderAccountListItem[],
  preferredId: string | null | undefined
): string | undefined {
  if (accounts.length === 0) return undefined;
  if (
    typeof preferredId === "string" &&
    accounts.some((a) => a.id === preferredId)
  ) {
    return preferredId;
  }
  const first = accounts[0]?.id;
  return typeof first === "string" ? first : undefined;
}

export function isXtreamCredentials(
  value: unknown
): value is XtreamCredentials {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.server === "string" &&
    typeof c.username === "string" &&
    typeof c.password === "string"
  );
}

const SESSION_FETCH_MS = 8000;

export async function fetchIptvSessionCredsFromApi(
  origin: string
): Promise<XtreamCredentials | null> {
  const ac = new AbortController();
  const fetchTimer = window.setTimeout(() => ac.abort(), SESSION_FETCH_MS);
  try {
    const r = await fetch(`${origin}/api/iptv/session`, {
      credentials: "include",
      cache: "no-store",
      signal: ac.signal,
    });
    let data: { creds?: unknown } = {};
    try {
      data = await r.json();
    } catch {
      data = {};
    }
    return isXtreamCredentials(data.creds) ? data.creds : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(fetchTimer);
  }
}

export async function listSavedProviderAccounts(
  origin: string,
  signal?: AbortSignal
): Promise<SavedProviderAccountListItem[]> {
  const r = await fetch(`${origin}/api/provider-accounts`, {
    credentials: "include",
    cache: "no-store",
    signal,
  });
  const listJson = (await r.json().catch(() => ({}))) as {
    accounts?: SavedProviderAccountListItem[];
  };
  if (!r.ok) return [];
  return listJson.accounts ?? [];
}

export async function activateSavedProviderOnServer(
  origin: string,
  accountId: string,
  signal?: AbortSignal
): Promise<boolean> {
  const r = await fetch(
    `${origin}/api/provider-accounts/${encodeURIComponent(accountId)}/activate`,
    { method: "POST", credentials: "include", signal }
  );
  return r.ok;
}

export type RestoreSavedProviderResult = {
  creds: XtreamCredentials;
  savedId: string;
};

/**
 * Load saved provider list, activate the best match, and read back the IPTV session cookie.
 * Used on new devices / TVs where only the Streamly login cookie survived.
 */
export async function restoreSavedProviderSession(
  origin: string,
  preferredId?: string | null
): Promise<RestoreSavedProviderResult | null> {
  const accounts = await listSavedProviderAccounts(origin);
  const chosenId = pickSavedProviderAccountId(accounts, preferredId);
  if (!chosenId) return null;
  const activated = await activateSavedProviderOnServer(origin, chosenId);
  if (!activated) return null;
  const creds = await fetchIptvSessionCredsFromApi(origin);
  if (!creds) return null;
  return { creds, savedId: chosenId };
}
