"use client";

import { useAuth } from "@/store/auth";
import { signOut as nextAuthSignOut } from "next-auth/react";

/**
 * Clears Stream (NextAuth) JWT and IPTV playback state (Zustand, session bridge,
 * HttpOnly Xtream cookie). Call from every "Sign out" control — partial sign-out
 * leaves a valid JWT while IPTV state is cleared, which re-activates saved playlists
 * and breaks "add playlist" with stale user ids.
 */
export async function signOutFully(): Promise<void> {
  try {
    await nextAuthSignOut({ redirect: false });
  } catch {
    /* offline or session already cleared */
  }
  useAuth.getState().signOut();
}

/** True when the server rejected a JWT whose user row no longer exists. */
export function isStaleStreamSessionStatus(status: number): boolean {
  return status === 401 || status === 409;
}
