"use client";

import { BrandMark } from "@/components/BrandMark";
import { SITE_NAME } from "@/lib/site-brand";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, type FormEvent, useState } from "react";

function ResetPasswordInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (!token) {
      setMsg("Missing reset token. Open the link from your email again.");
      return;
    }
    if (password !== confirm) {
      setMsg("Passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        setMsg(data.error || "Reset failed.");
        return;
      }
      router.push("/login?reset=1");
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-3 text-sm text-(--text-muted)">
        This page needs a valid link from your reset email.{" "}
        <Link href="/forgot-password" className="text-(--brand) hover:underline">
          Request a new one
        </Link>
        .
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-(--line) bg-(--bg-3)/80 p-4">
      <label className="block">
        <div className="text-xs text-(--text-dim) mb-1.5 font-medium">New password (8+ characters)</div>
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          disabled={busy}
          className="w-full h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) text-sm outline-none focus:border-(--brand)/50 disabled:opacity-60"
        />
      </label>
      <label className="block">
        <div className="text-xs text-(--text-dim) mb-1.5 font-medium">Confirm password</div>
        <input
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
          disabled={busy}
          className="w-full h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) text-sm outline-none focus:border-(--brand)/50 disabled:opacity-60"
        />
      </label>
      {msg && (
        <div className="text-xs rounded-lg border border-(--danger)/25 bg-(--danger)/10 text-(--danger) px-3 py-2">
          {msg}
        </div>
      )}
      <button
        type="submit"
        disabled={busy}
        className="w-full h-10 rounded-xl btn-brand text-sm font-medium disabled:opacity-60"
      >
        {busy ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
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
            <h1 className="text-xl font-semibold tracking-tight">Choose a new password</h1>
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
          <ResetPasswordInner />
        </Suspense>
      </div>
    </div>
  );
}
