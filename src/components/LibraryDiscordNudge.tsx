"use client";

import { DISCORD_STRIP_DISMISS_KEY, discordInviteUrl } from "@/lib/site-brand";
import {
  decideLibraryDiscordNudge,
  LIBRARY_DISCORD_NUDGE_SESSION_KEY,
  LIBRARY_DISCORD_NUDGE_STATE_KEY,
  type LibraryDiscordNudgeDecision,
} from "@/lib/library-discord-nudge";
import { useEffect, useState } from "react";

function readSessionDecision(): LibraryDiscordNudgeDecision | null {
  try {
    const value = sessionStorage.getItem(LIBRARY_DISCORD_NUDGE_SESSION_KEY);
    if (value === "show" || value === "hide") return value;
  } catch {
    /* private mode */
  }
  return null;
}

function readStoredSessions(): number {
  try {
    const raw = localStorage.getItem(LIBRARY_DISCORD_NUDGE_STATE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Desktop already shows the Discord strip until it is dismissed. */
function discordStripIsVisible(): boolean {
  try {
    if (localStorage.getItem(DISCORD_STRIP_DISMISS_KEY) === "1") return false;
  } catch {
    return false;
  }
  return window.matchMedia("(min-width: 1024px)").matches;
}

/**
 * One quiet line on Library, about once every four visits.
 * Hidden while the larger Discord strip is still on screen.
 */
export function LibraryDiscordNudge() {
  const [show, setShow] = useState(false);
  const href = discordInviteUrl();

  useEffect(() => {
    if (!href || discordStripIsVisible()) return;

    const existing = readSessionDecision();
    const decision = decideLibraryDiscordNudge({
      storedSessions: readStoredSessions(),
      sessionDecision: existing,
    });

    if (!existing) {
      try {
        localStorage.setItem(
          LIBRARY_DISCORD_NUDGE_STATE_KEY,
          String(decision.sessions)
        );
        sessionStorage.setItem(
          LIBRARY_DISCORD_NUDGE_SESSION_KEY,
          decision.sessionDecision
        );
      } catch {
        return;
      }
    }

    setShow(decision.show);
  }, [href]);

  if (!href || !show) return null;

  return (
    <p className="text-sm text-(--text-muted)">
      Something broken, or want updates?{" "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-(--text-dim) underline decoration-white/25 underline-offset-2 hover:text-(--text)"
      >
        Discord
      </a>
      .
    </p>
  );
}
