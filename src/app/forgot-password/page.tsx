"use client";

import { BrandMark } from "@/components/BrandMark";
import { SITE_NAME } from "@/lib/site-brand";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const r = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      if (!r.ok) {
        setMsg(data.error || "Something went wrong.");
        return;
      }
      setDone(true);
      setMsg(data.message ?? "Check your email for the next step.");
    } finally {
      setBusy(false);
    }
  }

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
            <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
            <p className="text-sm text-(--text-muted) mt-0.5">
              {SITE_NAME} — we&apos;ll email you a one-hour link if an account exists.
            </p>
          </div>
        </div>

        {done ? (
          <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-3 text-sm text-(--text-muted)">
            {msg}
            <div className="mt-4">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-sm text-(--brand) hover:underline"
              >
                Return to sign in
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-(--line) bg-(--bg-3)/80 p-4">
            <label className="block">
              <div className="text-xs text-(--text-dim) mb-1.5 font-medium">Email</div>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
