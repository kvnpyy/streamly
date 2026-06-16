"use client";

import { SITE_NAME } from "@/lib/site-brand";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type VerifyPhase = "missing" | "working" | "error";

export function VerifyEmailClient({ token }: { token: string }) {
  const router = useRouter();
  const verifyOnceRef = useRef(false);
  const [phase, setPhase] = useState<VerifyPhase>(token ? "working" : "missing");
  const [message, setMessage] = useState<string | null>(
    token ? null : "Missing verification token. Use the link from your email."
  );

  useEffect(() => {
    if (!token || verifyOnceRef.current) return;
    verifyOnceRef.current = true;

    let cancelled = false;

    void (async () => {
      try {
        const r = await fetch("/api/auth/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        if (cancelled) return;
        if (!r.ok) {
          setPhase("error");
          setMessage(data.error || "Verification failed.");
          return;
        }
        router.replace("/login?verified=1");
      } catch {
        if (cancelled) return;
        setPhase("error");
        setMessage("Network error. Check your connection and try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, router]);

  async function retry() {
    if (!token) return;
    setPhase("working");
    setMessage(null);
    try {
      const r = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setPhase("error");
        setMessage(data.error || "Verification failed.");
        return;
      }
      router.replace("/login?verified=1");
    } catch {
      setPhase("error");
      setMessage("Network error. Check your connection and try again.");
    }
  }

  return (
    <div
      className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-4 text-sm space-y-4"
      aria-live="polite"
      aria-busy={phase === "working"}
    >
      {phase === "missing" && (
        <p className="text-(--text-muted)">
          This page needs the link from your confirmation email.{" "}
          <Link href="/login" className="text-(--brand) hover:underline">
            Back to sign in
          </Link>
        </p>
      )}

      {phase === "working" && (
        <>
          <p className="text-(--text-muted)">
            Confirming your email for{" "}
            <span className="text-(--text)">{SITE_NAME}</span>…
          </p>
          <div className="flex items-center gap-2 text-(--text-dim)">
            <div
              className="size-4 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin"
              aria-hidden
            />
            <span>One moment</span>
          </div>
        </>
      )}

      {phase === "error" && message && (
        <>
          <p className="text-xs rounded-lg border border-(--danger)/25 bg-(--danger)/10 text-(--danger) px-3 py-2">
            {message}
          </p>
          {token ? (
            <button
              type="button"
              onClick={() => void retry()}
              className="w-full h-10 rounded-xl btn-brand text-sm font-medium"
            >
              Try again
            </button>
          ) : null}
          <p className="text-xs text-(--text-dim)">
            Link expired?{" "}
            <Link href="/login" className="text-(--brand) hover:underline">
              Sign in page
            </Link>{" "}
            → enter your email → use &quot;Resend confirmation&quot;.
          </p>
        </>
      )}
    </div>
  );
}
