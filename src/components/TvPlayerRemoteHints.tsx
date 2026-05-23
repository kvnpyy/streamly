"use client";

import { X } from "lucide-react";
import { useCallback, useState } from "react";

const STORAGE_KEY = "iptv-dismiss-tv-remote-hints";

type TvPlayerRemoteHintsProps = {
  flipWithArrowKeys: boolean;
  /** Series playlist uses ↑/↓ for episodes; live uses channels. */
  flipIsEpisodeList: boolean;
  isLive: boolean;
};

export function TvPlayerRemoteHints({
  flipWithArrowKeys,
  flipIsEpisodeList,
  isLive,
}: TvPlayerRemoteHintsProps) {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return sessionStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  });

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* noop */
    }
    setDismissed(true);
  }, []);

  if (dismissed) return null;

  const parts: string[] = [
    "OK on video — Play/Pause",
    "OK on a toolbar button — activates that control",
    "Back — Exit",
  ];

  if (!isLive) parts.push("◀ ▶ — Seek");

  if (flipWithArrowKeys) {
    parts.push(
      flipIsEpisodeList
        ? "▲ ▼ — Previous / next episode"
        : "▲ ▼ — Previous / next channel"
    );
  } else if (!isLive) {
    parts.push("▲ ▼ — Volume");
  }

  parts.push("M — Mute");

  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-black/55 px-3 py-2 text-[11px] leading-snug text-white/80 ring-1 ring-white/10">
      <span className="min-w-0 flex-1">{parts.join(" · ")}</span>
      <button
        type="button"
        onClick={dismiss}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-white/75 hover:bg-white/10 hover:text-white"
        aria-label="Dismiss remote hints"
      >
        <X className="size-3.5 opacity-70" aria-hidden />
        Dismiss
      </button>
    </div>
  );
}
