"use client";

import { useEffect, type RefObject } from "react";
import { usePlayer } from "@/store/player";

/** Press `/` (when the player is closed) to focus the catalog search field. */
export function useSlashFocusSearch(
  inputRef: RefObject<HTMLInputElement | null>
) {
  const playerOpen = usePlayer((s) => s.open);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.("input, textarea, select, [contenteditable=true]"))
        return;
      if (playerOpen) return;
      e.preventDefault();
      const el =
        inputRef.current ??
        document.getElementById("global-search-input");
      if (!el || !(el instanceof HTMLInputElement)) return;
      el.focus();
      el.select?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [playerOpen, inputRef]);
}
