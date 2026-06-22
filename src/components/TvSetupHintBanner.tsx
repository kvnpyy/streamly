"use client";

import { useNativeTvUa } from "@/components/TvBrowserProvider";
import { SITE_NAME } from "@/lib/site-brand";
import { Bookmark, Settings2, Tv, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useSyncExternalStore } from "react";

const DISMISS_KEY = "streamly-tv-setup-hint-dismissed-v1";

function subscribeDismiss(callback: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === DISMISS_KEY) callback();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

function useTvHintDismissed(): [boolean, () => void] {
  const dismissed = useSyncExternalStore(
    subscribeDismiss,
    readDismissed,
    () => false
  );
  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* noop */
    }
    window.dispatchEvent(new StorageEvent("storage", { key: DISMISS_KEY }));
  }, []);
  return [dismissed, dismiss];
}

const TIPS = [
  {
    icon: Bookmark,
    title: "Bookmark this page",
    body: "Add Streamly to your TV browser home screen for one-tap launch next time.",
  },
  {
    icon: Settings2,
    title: "Comfort TV mode",
    body: "Settings → enable larger text and buttons if the UI feels small on your TV.",
  },
  {
    icon: Tv,
    title: "PIN pairing",
    body: "Link additional TVs from Settings on your phone — no password on the remote.",
  },
] as const;

export function TvSetupHintBanner() {
  const nativeTv = useNativeTvUa();
  const [dismissed, dismiss] = useTvHintDismissed();

  if (!nativeTv || dismissed) return null;

  return (
    <section
      className="mb-4 rounded-2xl border border-(--brand)/30 bg-(--brand)/8 p-4 sm:p-5"
      aria-label={`${SITE_NAME} TV tips`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-(--brand-2) mb-1">
            TV quick tips
          </p>
          <h2 className="text-base font-semibold text-(--text)">
            You&apos;re set up on your TV
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="size-9 shrink-0 rounded-lg grid place-items-center text-(--text-muted) hover:text-(--text) hover:bg-(--bg-3) focus-ring"
          aria-label="Dismiss TV tips"
        >
          <X className="size-4" />
        </button>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3 mb-3">
        {TIPS.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="rounded-xl border border-white/8 bg-(--bg-2)/60 px-3 py-2.5 text-xs text-(--text-dim) leading-relaxed"
          >
            <div className="flex items-center gap-1.5 text-(--text) font-medium mb-1">
              <Icon className="size-3.5 text-(--brand-2)" aria-hidden />
              {title}
            </div>
            {body}
          </li>
        ))}
      </ul>
      <Link
        href="/tv"
        className="text-xs text-(--brand-2) underline underline-offset-2 hover:text-(--text) focus-ring rounded"
      >
        Open full Smart TV setup guide
      </Link>
    </section>
  );
}
