"use client";

import { cn } from "@/lib/utils";
import { SITE_NAME } from "@/lib/site-brand";
import { signIn, signOut, useSession } from "next-auth/react";
import { LogIn, LogOut, UserPlus } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type FormEvent, useState } from "react";

/**
 * Email/password account (Auth.js). IPTV provider login stays separate below.
 */
export function StreamIdentityCard() {
  const { data: session, status } = useSession();
  const searchParams = useSearchParams();
  const urlNotice =
    searchParams.get("reset") === "1"
      ? "Password updated. Sign in with your new password."
      : searchParams.get("verified") === "1"
        ? "Email confirmed. Sign in below."
        : null;

  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [resendBusy, setResendBusy] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  const banner = urlNotice ?? info;

  if (status === "loading") {
    return (
      <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-3 text-sm text-(--text-muted)">
        Checking {SITE_NAME} account…
      </div>
    );
  }

  if (session?.user?.email) {
    return (
      <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="text-sm min-w-0">
          <div className="text-(--text-muted) text-xs uppercase tracking-wide mb-0.5">
            {SITE_NAME} account
          </div>
          <div className="text-(--text) font-medium truncate">{session.user.email}</div>
          <p className="text-xs text-(--text-dim) mt-1">
            IPTV logins you add are encrypted on this server under your account.
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setMsg(null);
            await signOut({ redirect: false });
            setBusy(false);
          }}
          className="shrink-0 h-9 px-3 rounded-lg bg-(--bg-2) border border-(--line) text-sm flex items-center justify-center gap-2 hover:border-(--line-2)"
        >
          <LogOut className="size-4" />
          Sign out
        </button>
      </div>
    );
  }

  async function onRegister(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setInfo(null);
    if (password !== confirm) {
      setMsg("Passwords don’t match.");
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${window.location.origin}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          name: name.trim() || undefined,
          marketingOptIn,
        }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        error?: string;
        needsVerification?: boolean;
      };
      if (!r.ok) {
        setMsg(data.error || `Registration failed (${r.status}).`);
        return;
      }
      if (data.needsVerification) {
        setInfo(
          `We sent a confirmation link to ${email.trim()}. Open it, then sign in here.`
        );
        setPassword("");
        setConfirm("");
        setMode("signin");
        return;
      }
    } finally {
      setBusy(false);
    }
  }

  async function onResendVerification() {
    const addr = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
      setMsg("Enter your email above, then tap resend.");
      return;
    }
    setResendBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${window.location.origin}/api/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: addr }),
      });
      const data = (await r.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!r.ok) {
        setMsg(data.error || "Could not resend right now.");
        return;
      }
      setInfo(data.message ?? "If that address has an unverified account, check your inbox.");
    } finally {
      setResendBusy(false);
    }
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      const signed = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });
      if (signed?.error) {
        if (signed.code === "verify_email") {
          setMsg(
            "Confirm your email before signing in. Check your inbox (and spam), or resend the link below."
          );
        } else {
          setMsg("Invalid email or password.");
        }
        return;
      }
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 p-4 space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setMsg(null);
            setInfo(null);
          }}
          className={cn(
            "h-8 px-3 rounded-lg text-xs font-medium transition-colors",
            mode === "signin"
              ? "bg-(--bg-1) text-(--text) shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              : "text-(--text-dim) hover:text-(--text)"
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <LogIn className="size-3.5" /> Sign in
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("register");
            setMsg(null);
            setInfo(null);
          }}
          className={cn(
            "h-8 px-3 rounded-lg text-xs font-medium transition-colors",
            mode === "register"
              ? "bg-(--bg-1) text-(--text) shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
              : "text-(--text-dim) hover:text-(--text)"
          )}
        >
          <span className="inline-flex items-center gap-1.5">
            <UserPlus className="size-3.5" /> Create account
          </span>
        </button>
      </div>

      {banner && (
        <div className="text-xs rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-200 px-3 py-2">
          {banner}
        </div>
      )}

      {mode === "register" ? (
        <form onSubmit={onRegister} className="space-y-3">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            required
            disabled={busy}
          />
          <Field
            label="Display name (optional)"
            type="text"
            autoComplete="name"
            value={name}
            onChange={setName}
            disabled={busy}
          />
          <Field
            label="Password (8+ characters)"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            required
            disabled={busy}
          />
          <Field
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={setConfirm}
            required
            disabled={busy}
          />
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="mt-0.5 size-4 rounded border-(--line) accent-(--brand)"
              checked={marketingOptIn}
              disabled={busy}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
            />
            <span className="text-[11px] text-(--text-muted) leading-relaxed">
              Email me occasional {SITE_NAME} tips and launch news (optional). You can
              change this anytime in Settings or unsubscribe from any message.
            </span>
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 rounded-xl btn-brand text-sm font-medium disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create account"}
          </button>
        </form>
      ) : (
        <form onSubmit={onSignIn} className="space-y-3">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={setEmail}
            required
            disabled={busy}
          />
          <Field
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            required
            disabled={busy}
          />
          <div className="flex justify-end">
            <Link
              href="/forgot-password"
              className="text-[11px] text-(--text-muted) hover:text-(--brand) underline underline-offset-2"
            >
              Forgot password?
            </Link>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full h-10 rounded-xl btn-brand text-sm font-medium disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 justify-center pt-1">
            <button
              type="button"
              disabled={resendBusy}
              onClick={() => void onResendVerification()}
              className="text-[11px] text-(--text-muted) hover:text-(--brand) underline underline-offset-2 disabled:opacity-50"
            >
              {resendBusy ? "Sending…" : "Resend confirmation email"}
            </button>
          </div>
        </form>
      )}

      {msg && (
        <div className="text-xs rounded-lg border border-(--danger)/25 bg-(--danger)/10 text-(--danger) px-3 py-2">
          {msg}
        </div>
      )}

      <p className="text-[11px] text-(--text-muted) leading-relaxed">
        Optional for testing on a single device: you can skip this and sign in with IPTV only.
        For hosted setups, use a {SITE_NAME} account so providers stay encrypted on the server.
      </p>
    </div>
  );
}

function Field({
  label,
  type,
  value,
  onChange,
  required,
  disabled,
  autoComplete,
}: {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
}) {
  return (
    <label className="block">
      <div className="text-xs text-(--text-dim) mb-1.5 font-medium">{label}</div>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        autoComplete={autoComplete}
        className="w-full h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) text-sm outline-none focus:border-(--brand)/50 disabled:opacity-60"
      />
    </label>
  );
}
