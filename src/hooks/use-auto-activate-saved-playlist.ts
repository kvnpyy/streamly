"use client";

import { pickSavedProviderAccountId } from "@/lib/restore-saved-providers";
import { usePrefs } from "@/store/preferences";
import { useEffect, useRef } from "react";

/**
 * When Streamly is signed in but IPTV cookie is missing (common on TVs after updates),
 * try once to activate a cloud-saved playlist without making the user hunt through forms.
 */
export function useAutoActivateSavedPlaylist(opts: {
  enabled: boolean;
  playlists: { id: string }[];
  loading: boolean;
  onActivate: (id: string) => void | Promise<void>;
}) {
  const { enabled, playlists, loading, onActivate } = opts;
  const activeSavedId = usePrefs((s) => s.activeSavedProviderAccountId);
  const attemptedRef = useRef(false);

  useEffect(() => {
    if (!enabled || loading || playlists.length === 0 || attemptedRef.current) return;
    const chosenId = pickSavedProviderAccountId(playlists, activeSavedId);
    if (!chosenId) return;
    attemptedRef.current = true;
    void onActivate(chosenId);
  }, [enabled, loading, playlists, activeSavedId, onActivate]);
}
