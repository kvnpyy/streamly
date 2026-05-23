"use client";

import { useTvBrowser } from "@/components/TvBrowserProvider";
import { SITE_NAME } from "@/lib/site-brand";
import { Loader2, Smartphone, Tv } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type IssueResponse = { pin: string; expiresInSeconds: number };

export function TvPairingCard() {
  const tv = useTvBrowser();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState<IssueResponse | null>(null);
  const [remain, setRemain] = useState(0);

  useEffect(() => {
    if (!active) return;
    const deadline = Date.now() + active.expiresInSeconds * 1000;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemain(left);
      if (left <= 0) setActive(null);
    };
    tick();
    const t = window.setInterval(tick, 1000);
    return () => window.clearInterval(t);
  }, [active]);

  const issue = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const r = await fetch(`${window.location.origin}/api/auth/pair/issue`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await r.json().catch(() => ({}))) as IssueResponse & {
        error?: string;
      };
      if (!r.ok) {
        throw new Error(data.error || `Could not create code (${r.status})`);
      }
      if (!data.pin) throw new Error("Invalid response");
      setActive({
        pin: data.pin,
        expiresInSeconds: data.expiresInSeconds ?? 600,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const mm = Math.floor(remain / 60);
  const ss = remain % 60;

  return (
    <section className="card p-5">
      <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
        <Smartphone className="size-4 text-(--brand-2)" />
        Link a TV with a PIN
      </h3>
      <p className="text-sm text-(--text-dim) mb-4 leading-relaxed">
        Sign in on your phone or computer here first. Generate a 6-digit code, then on the TV open{" "}
        <strong className="text-(--text)">Sign in → Link with PIN</strong> and type it — no server URL
        or password on the remote.
      </p>
      {tv && (
        <div className="mb-4 flex gap-2 rounded-xl border border-(--brand)/25 bg-(--brand)/5 px-3 py-2 text-xs text-(--text-dim)">
          <Tv className="size-4 shrink-0 text-(--brand) mt-0.5" aria-hidden />
          <span>
            You&apos;re on a TV browser. Open <strong className="text-(--text)">Settings</strong> on a
            phone or laptop signed into the same {SITE_NAME} app to create a code.
          </span>
        </div>
      )}

      {!active ? (
        <button
          type="button"
          onClick={() => void issue()}
          disabled={loading || tv}
          className="h-10 px-4 rounded-xl btn-brand text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Creating…
            </>
          ) : (
            "Generate TV code"
          )}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="rounded-2xl bg-(--bg-3) border border-(--line) px-6 py-8 text-center">
            <div className="text-[11px] uppercase tracking-wider text-(--text-muted) mb-2">
              Enter on TV
            </div>
            <div className="font-mono text-4xl sm:text-5xl tracking-[0.35em] text-(--text) tabular-nums pl-[0.35em]">
              {active.pin}
            </div>
            <div className="mt-4 text-sm text-(--text-dim)">
              Expires in {mm}:{ss.toString().padStart(2, "0")}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void issue()}
              className="h-9 px-3 rounded-lg bg-(--bg-3) border border-(--line) hover:border-(--line-2) text-sm"
            >
              New code
            </button>
            <button
              type="button"
              onClick={() => setActive(null)}
              className="h-9 px-3 rounded-lg text-sm text-(--text-muted) hover:text-(--text)"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 text-sm rounded-lg border border-(--danger)/30 bg-(--danger)/10 text-(--danger) px-3 py-2">
          {error}
        </div>
      )}
    </section>
  );
}
