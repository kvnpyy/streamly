"use client";

import { SITE_NAME } from "@/lib/site-brand";
import { Mail } from "lucide-react";
import { useEffect, useState } from "react";

type MarketingState = {
  marketingOptIn: boolean;
  subscribed: boolean;
  emailVerified: boolean;
  unsubscribedAt: string | null;
};

export function MarketingEmailPreferences() {
  const [state, setState] = useState<MarketingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const r = await fetch("/api/account/marketing", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await r.json().catch(() => ({}))) as MarketingState & {
          error?: string;
        };
        if (cancelled) return;
        if (!r.ok) {
          // Non-critical feature — hide rather than show a scary red error.
          setHidden(true);
          return;
        }
        setState({
          marketingOptIn: data.marketingOptIn,
          subscribed: data.subscribed,
          emailVerified: data.emailVerified,
          unsubscribedAt: data.unsubscribedAt,
        });
      } catch {
        // Network error — silently hide this optional section.
        if (!cancelled) setHidden(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onToggle(next: boolean) {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/account/marketing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketingOptIn: next }),
      });
      const data = (await r.json().catch(() => ({}))) as MarketingState & {
        error?: string;
      };
      if (!r.ok) {
        setErr(data.error || "Could not update preferences.");
        return;
      }
      setState({
        marketingOptIn: data.marketingOptIn,
        subscribed: data.subscribed,
        emailVerified: data.emailVerified,
        unsubscribedAt: data.unsubscribedAt,
      });
    } finally {
      setBusy(false);
    }
  }

  if (hidden) return null;

  return (
    <section className="card p-5">
      <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
        <Mail className="size-4 text-(--brand-2)" />
        Product updates
      </h3>
      <p className="text-sm text-(--text-dim) mb-4 leading-relaxed">
        Optional emails about {SITE_NAME} features, tips, and launch news. Password
        resets and security messages are separate and may still be sent.
      </p>

      {loading ? (
        <p className="text-sm text-(--text-muted)">Loading…</p>
      ) : state ? (
        <div className="space-y-3">
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-1 size-4 rounded border-(--line) accent-(--brand)"
              checked={state.marketingOptIn}
              disabled={busy || !state.emailVerified}
              onChange={(e) => void onToggle(e.target.checked)}
            />
            <span className="text-sm text-(--text) leading-snug">
              Send me occasional product updates
            </span>
          </label>
          {err && (
            <p className="text-xs text-(--danger)">{err}</p>
          )}
          {!state.emailVerified && (
            <p className="text-xs text-(--text-muted)">
              Confirm your email first (check your inbox after signup).
            </p>
          )}
          {state.subscribed && (
            <p className="text-xs text-emerald-200/90">
              You&apos;re subscribed to product updates.
            </p>
          )}
          {state.unsubscribedAt && !state.marketingOptIn && (
            <p className="text-xs text-(--text-muted)">
              Unsubscribed{" "}
              {new Date(state.unsubscribedAt).toLocaleDateString(undefined, {
                dateStyle: "medium",
              })}
              . Turn the checkbox on to re-subscribe.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}
