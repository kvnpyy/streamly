"use client";

import { CommunityDiscordLink } from "@/components/CommunityDiscordLink";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import { notifyChromeLayoutShift } from "@/lib/shell-layout";
import { discordInviteUrl, SITE_NAME } from "@/lib/site-brand";
import { useLiveBrowseUi } from "@/store/live-browse-ui";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from "react";

const DISMISS_KEY = "streamly-discord-strip-dismissed-v1";
const COLLAPSE_MS = 220;

type StripPhase = "pending" | "open" | "closing" | "gone";

function persistDismiss() {
  scheduleWhenIdle(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* quota / private mode */
    }
  }, 0);
}

/** Slim community CTA below the app top bar — dismissible per browser. */
export function CommunityDiscordStrip({ className }: { className?: string }) {
  const href = discordInviteUrl();
  const closeCategory = useLiveBrowseUi((s) => s.closeCategory);
  const [phase, setPhase] = useState<StripPhase>("pending");
  const dismissingRef = useRef(false);

  useEffect(() => {
    try {
      const hidden = localStorage.getItem(DISMISS_KEY) === "1";
      queueMicrotask(() => setPhase(hidden ? "gone" : "open"));
    } catch {
      queueMicrotask(() => setPhase("open"));
    }
  }, []);

  const dismiss = useCallback(
    (e?: SyntheticEvent | Event) => {
      e?.stopPropagation();
      if (dismissingRef.current || phase === "closing" || phase === "gone") return;
      dismissingRef.current = true;
      closeCategory();
      notifyChromeLayoutShift();
      setPhase("closing");
      persistDismiss();
      window.setTimeout(() => setPhase("gone"), COLLAPSE_MS);
    },
    [closeCategory, phase]
  );

  /** Swallow the synthetic click from the dismiss tap without blocking future touches. */
  useEffect(() => {
    if (phase !== "closing") return;
    const swallow = (e: Event) => {
      e.stopPropagation();
    };
    document.addEventListener("click", swallow, true);
    const t = window.setTimeout(() => {
      document.removeEventListener("click", swallow, true);
    }, 360);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("click", swallow, true);
    };
  }, [phase]);

  if (!href || phase === "pending" || phase === "gone") return null;

  return (
    <div
      className={cn(
        "hidden lg:flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/10 px-3 py-2.5 sm:px-4 transition-[max-height,opacity,padding,margin,border-width] duration-200 ease-out overflow-hidden",
        phase === "closing" &&
          "max-h-0 opacity-0 py-0 border-0 pointer-events-none !mb-0",
        className
      )}
      role="note"
      aria-hidden={phase === "closing"}
    >
      <p className="text-sm text-(--text-dim) leading-snug min-w-0">
        <span className="text-(--text) font-medium">Join the {SITE_NAME} Discord</span>
        {" — "}
        setup help, release notes, and chat with other users.
      </p>
      <div className="flex items-center gap-2 shrink-0">
        <CommunityDiscordLink
          label="Join Discord"
          className="min-h-9 px-3.5 rounded-lg bg-[#5865F2]/20 border border-[#5865F2]/40 hover:border-[#5865F2]/60 text-sm font-medium text-[#dce0ff]"
        />
        <button
          type="button"
          onClick={(e) => dismiss(e)}
          className="size-9 rounded-lg text-(--text-muted) hover:text-(--text) hover:bg-white/5 transition-colors inline-flex items-center justify-center touch-manipulation"
          aria-label="Dismiss Discord community notice"
        >
          <X className="size-4 pointer-events-none" />
        </button>
      </div>
    </div>
  );
}
