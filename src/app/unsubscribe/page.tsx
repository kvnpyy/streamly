"use client";

import { BrandMark } from "@/components/BrandMark";
import { SITE_NAME } from "@/lib/site-brand";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function UnsubscribeWithToken({ token }: { token: string }) {
  const [status, setStatus] = useState<"busy" | "ok" | "err">("busy");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/marketing/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const data = (await r.json().catch(() => ({}))) as {
          error?: string;
          email?: string;
        };
        if (cancelled) return;
        if (!r.ok) {
          setStatus("err");
          setMessage(data.error || "Could not unsubscribe.");
          return;
        }
        setStatus("ok");
        setMessage(
          data.email
            ? `${data.email} is unsubscribed from ${SITE_NAME} product updates.`
            : `You are unsubscribed from ${SITE_NAME} product updates.`
        );
      } catch {
        if (!cancelled) {
          setStatus("err");
          setMessage("Something went wrong. Try again in a moment.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-4 text-sm space-y-3">
      {status === "busy" && (
        <p className="text-(--text-muted)">Updating your preferences…</p>
      )}
      {status !== "busy" && message && (
        <p
          className={
            status === "ok"
              ? "text-(--text)"
              : "text-xs rounded-lg border border-(--danger)/25 bg-(--danger)/10 text-(--danger) px-3 py-2"
          }
        >
          {message}
        </p>
      )}
      {status === "ok" && (
        <p className="text-xs text-(--text-dim)">
          Password resets and other account security emails are separate. You can
          manage preferences anytime in{" "}
          <Link href="/app/settings" className="text-(--brand) hover:underline">
            Settings
          </Link>
          .
        </p>
      )}
      <Link
        href="/login"
        className="inline-block text-(--brand) hover:underline font-medium"
      >
        Back to sign in
      </Link>
    </div>
  );
}

function UnsubscribeInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  if (!token) {
    return (
      <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-4 text-sm space-y-3">
        <p className="text-xs rounded-lg border border-(--danger)/25 bg-(--danger)/10 text-(--danger) px-3 py-2">
          This unsubscribe link is missing a token.
        </p>
        <Link
          href="/login"
          className="inline-block text-(--brand) hover:underline font-medium"
        >
          Back to sign in
        </Link>
      </div>
    );
  }

  return <UnsubscribeWithToken token={token} />;
}

export default function UnsubscribePage() {
  return (
    <div className="min-h-screen bg-[#06070b] text-[#eef0f6] px-4 py-12">
      <div className="max-w-md mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BrandMark size={10} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Unsubscribe</h1>
            <p className="text-sm text-(--text-muted) mt-0.5">{SITE_NAME}</p>
          </div>
        </div>
        <Suspense
          fallback={
            <div className="text-sm text-(--text-muted) rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-3">
              Loading…
            </div>
          }
        >
          <UnsubscribeInner />
        </Suspense>
      </div>
    </div>
  );
}
