import type { XtreamCredentials } from "@/lib/xtream-types";
import { providerLabelFromCreds } from "@/lib/provider-account-label";
import { usePrefs } from "@/store/preferences";
import { getSession } from "next-auth/react";

/**
 * After Xtream auth succeeds in the browser: save to server (Streamly account)
 * or device session cookie, then caller typically assigns `/app`.
 */
export async function persistIptvAfterBrowserLogin(
  creds: XtreamCredentials
): Promise<void> {
  const origin = window.location.origin;
  const streamUser = await getSession();

  if (streamUser?.user?.id) {
    const pa = await fetch(`${origin}/api/provider-accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        label: providerLabelFromCreds(creds),
        creds,
      }),
    });
    const paJson = (await pa.json().catch(() => ({}))) as {
      error?: string;
      id?: string;
    };
    if (!pa.ok) {
      throw new Error(
        paJson.error || `Could not save provider on the server (${pa.status}).`
      );
    }
    if (typeof paJson.id === "string") {
      usePrefs.getState().setActiveSavedProviderAccountId(paJson.id);
      // Broadcast to any mounted PlaylistSwitcher / ProviderAccountsPanel
      // so they refetch without needing access to the QueryClient here.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("provider-account-saved"));
      }
    }
  } else {
    const sess = await fetch(`${origin}/api/iptv/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ creds }),
    });
    if (!sess.ok) {
      throw new Error(
        `Could not save session on this device (${sess.status}). Try again.`
      );
    }
  }
}
