"use client";

import {
  COOKIE_CONSENT_CHANGED_EVENT,
  COOKIE_CONSENT_STORAGE_KEY,
  isCookieConsentBannerEnabled,
  type CookieConsentChoice,
} from "@/lib/cookie-consent";
import Link from "next/link";
import { useEffect, useState } from "react";

const SHOW = isCookieConsentBannerEnabled();

export function CookieConsentBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!SHOW) return;
    queueMicrotask(() => {
      try {
        if (!localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)) setVisible(true);
      } catch {
        setVisible(true);
      }
    });
  }, []);

  function persist(choice: CookieConsentChoice) {
    try {
      localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
    } catch {
      /* quota / private mode */
    }
    setVisible(false);
    try {
      window.dispatchEvent(
        new CustomEvent(COOKIE_CONSENT_CHANGED_EVENT, { detail: { choice } })
      );
    } catch {
      /* noop */
    }
  }

  if (!SHOW || !visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie preferences"
      className="fixed bottom-0 inset-x-0 z-[200] p-3 sm:p-4 pointer-events-none"
    >
      <div className="max-w-lg mx-auto pointer-events-auto rounded-2xl border border-(--line) bg-(--bg-1)/95 backdrop-blur-md shadow-[0_-8px_40px_rgba(0,0,0,0.35)] px-4 py-4 space-y-3">
        <p className="text-sm text-(--text) leading-relaxed">
          We use essential cookies and storage so login and preferences work.
          Optional analytics (if the host enables them) respect your choice
          below.
        </p>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <Link
            href="/legal/privacy"
            className="text-xs text-(--brand) hover:underline underline-offset-2 min-h-11 inline-flex items-center"
          >
            Privacy Policy
          </Link>
          <div className="flex flex-wrap gap-2 justify-end">
            <button
              type="button"
              onClick={() => persist("essential")}
              className="min-h-11 px-4 rounded-xl bg-(--bg-3) border border-(--line) text-sm text-(--text) hover:border-(--line-2)"
            >
              Essential only
            </button>
            <button
              type="button"
              onClick={() => persist("all")}
              className="min-h-11 px-4 rounded-xl btn-brand text-sm font-medium"
            >
              Accept all
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
