"use client";

import { BrandMark } from "@/components/BrandMark";
import { SITE_NAME } from "@/lib/site-brand";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function VerifyEmailInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "err">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function confirm() {
    setMessage(null);
    if (!token) {
      setStatus("err");
      setMessage("Missing verification token. Use the link from your email.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setStatus("err");
        setMessage(data.error || "Verification failed.");
        return;
      }
      setStatus("ok");
      setMessage("Your email is confirmed. You can sign in now.");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-4 text-sm space-y-3">
        <p className="text-(--text-muted)">
          This page needs the link from your confirmation email.{" "}
          <Link href="/login" className="text-(--brand) hover:underline">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  if (status === "ok" && message) {
    return (
      <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-4 text-sm space-y-3">
        <p className="text-(--text)">{message}</p>
        <button
          type="button"
          onClick={() => router.push("/login?verified=1")}
          className="text-(--brand) hover:underline font-medium"
        >
          Go to sign in
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-4 text-sm space-y-4">
      <p className="text-(--text-muted)">
        Confirm <span className="text-(--text)">{SITE_NAME}</span> is using the correct address for your account.
      </p>
      {status === "err" && message && (
        <p className="text-xs rounded-lg border border-(--danger)/25 bg-(--danger)/10 text-(--danger) px-3 py-2">
          {message}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void confirm()}
        className="w-full h-10 rounded-xl btn-brand text-sm font-medium disabled:opacity-60"
      >
        {busy ? "Confirming…" : "Confirm email"}
      </button>
      <p className="text-xs text-(--text-dim)">
        Link expired?{" "}
        <Link href="/login" className="text-(--brand) hover:underline">
          Sign in page
        </Link>{" "}
        → enter your email → use &quot;Resend confirmation&quot;.
      </p>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen bg-[#06070b] text-[#eef0f6] px-4 py-12">
      <div className="max-w-md mx-auto space-y-6">
        <Link
          href="/login"
          className="text-sm text-(--text-muted) hover:text-(--text) underline underline-offset-2"
        >
          ← Back to sign in
        </Link>
        <div className="flex items-center gap-3">
          <BrandMark size={10} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Confirm email</h1>
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
          <VerifyEmailInner />
        </Suspense>
      </div>
    </div>
  );
}
