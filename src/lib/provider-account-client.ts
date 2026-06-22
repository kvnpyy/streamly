/**
 * Browser client for `/api/provider-accounts` saved Xtream identities.
 */

import { fetchIptvSessionCredsFromApi } from "@/lib/restore-saved-providers";
import type { AuthResponse, XtreamCredentials } from "@/lib/xtream-types";

export type SavedProviderAccountRow = {
  id: string;
  label: string;
  createdAt?: string | Date;
};

const origin =
  typeof window !== "undefined" ? window.location.origin : "";

export async function fetchSavedProviderAccounts(): Promise<
  SavedProviderAccountRow[]
> {
  const r = await fetch(`${origin}/api/provider-accounts`, {
    credentials: "include",
    cache: "no-store",
  });
  const data = (await r.json().catch(() => ({}))) as {
    accounts?: SavedProviderAccountRow[];
    error?: string;
  };
  if (!r.ok) {
    throw new Error(data.error || `Could not load accounts (${r.status}).`);
  }
  return data.accounts ?? [];
}

/**
 * Activate a saved server-side account (sets playback cookie), sync Zustand
 * creds/account from `/api/iptv/session`.
 */
export async function activateSavedProviderAccount(
  id: string
): Promise<{ creds: XtreamCredentials; account: AuthResponse | null }> {
  const r = await fetch(
    `${origin}/api/provider-accounts/${encodeURIComponent(id)}/activate`,
    { method: "POST", credentials: "include" }
  );
  const data = (await r.json().catch(() => ({}))) as {
    error?: string;
    account?: AuthResponse;
  };
  if (!r.ok) {
    throw new Error(data.error || `Activate failed (${r.status}).`);
  }

  const creds = await fetchIptvSessionCredsFromApi(origin);
  if (!creds) {
    throw new Error("Cookie session missing after activate.");
  }
  return { creds, account: data.account ?? null };
}
