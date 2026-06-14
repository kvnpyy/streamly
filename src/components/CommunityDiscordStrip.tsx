"use client";

import { CommunityDiscordLink } from "@/components/CommunityDiscordLink";
import { discordInviteUrl, SITE_NAME } from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "streamly-discord-strip-dismissed-v1";

/** Slim community CTA below the app top bar — dismissible per browser. */
export function CommunityDiscordStrip({ className }: { className?: string }) {
  const href = discordInviteUrl();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      const hidden = localStorage.getItem(DISMISS_KEY) === "1";
      queueMicrotask(() => setDismissed(hidden));
    } catch {
      queueMicrotask(() => setDismissed(false));
    }
  }, []);

  if (!href || dismissed) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#5865F2]/30 bg-[#5865F2]/10 px-3 py-2.5 sm:px-4",
        className
      )}
      role="note"
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
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, "1");
            } catch {
              /* private mode */
            }
            setDismissed(true);
          }}
          className="size-9 rounded-lg text-(--text-muted) hover:text-(--text) hover:bg-white/5 transition-colors inline-flex items-center justify-center"
          aria-label="Dismiss Discord community notice"
        >
          <X className="size-4" />
        </button>
      </div>
    </div>
  );
}
