"use client";

import { StreamIdentityCard } from "@/components/StreamIdentityCard";
import { BrandMark } from "@/components/BrandMark";
import { CommunityDiscordLink } from "@/components/CommunityDiscordLink";
import { UserContentDisclaimer } from "@/components/UserContentDisclaimer";
import { useAuthBootstrapReady } from "@/components/AuthSessionBootstrap";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { detectTvBrowser } from "@/lib/tv-browser";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-brand";
import { persistIptvAfterBrowserLogin } from "@/lib/persist-iptv-session-client";
import { tryParseM3uPortalUrl } from "@/lib/provider-account-label";
import { cn, normalizeServer } from "@/lib/utils";
import { xtream } from "@/lib/xtream";
import { useAuth, writeAuthSessionBridge } from "@/store/auth";
import {
  AtSign,
  ChevronRight,
  Hash,
  KeyRound,
  Link as LinkIcon,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Turnstile } from "@marsidev/react-turnstile";
import { useSession } from "next-auth/react";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";

type Tab = "xtream" | "m3u" | "pin";

const TURNSTILE_SITE_KEY =
  typeof process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === "string"
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim()
    : "";

function readServerFromSearch(sp: ReadonlyURLSearchParams): string {
  const srv = sp.get("server");
  if (!srv?.trim()) return "";
  try {
    return normalizeServer(decodeURIComponent(srv.trim()));
  } catch {
    return normalizeServer(srv.trim());
  }
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cookieReady = useAuthBootstrapReady();
  const creds = useAuth((s) => s.creds);
  const setCreds = useAuth((s) => s.setCreds);
  const setAccount = useAuth((s) => s.setAccount);
  const { data: session, status: sessionStatus } = useSession();
  const streamlySignedIn =
    sessionStatus === "authenticated" && Boolean(session?.user);
  const tv = useTvBrowser();
  /** Turnstile iframe breaks on several TV WebKits (`message.data` not a string). */
  const needsClientTurnstile = Boolean(TURNSTILE_SITE_KEY) && !tv;

  const [server, setServer] = useState(() => readServerFromSearch(searchParams));
  const [username, setUsername] = useState(() => searchParams.get("username") ?? "");
  const [password, setPassword] = useState(() => searchParams.get("password") ?? "");
  const [m3u, setM3u] = useState("");
  const [pin, setPin] = useState("");
  const [tab, setTab] = useState<Tab>(() =>
    typeof window !== "undefined" && detectTvBrowser() ? "pin" : "xtream"
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileMountKey, setTurnstileMountKey] = useState(0);
  const prevTabRef = useRef<Tab | undefined>(undefined);

  /** Remount Turnstile when switching tabs — not on first paint (avoids DOM races with the widget). */
  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = tab;
    if (prev === undefined || prev === tab) return;
    queueMicrotask(() => {
      setTurnstileToken(null);
      setTurnstileMountKey((k) => k + 1);
    });
  }, [tab]);

  /** Never keep credentials in the URL (history, screenshots). Fields come from useSearchParams; strip sensitive params. */
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const had =
        u.searchParams.has("password") ||
        u.searchParams.has("username") ||
        u.searchParams.has("server");
      if (!had) return;
      u.searchParams.delete("password");
      u.searchParams.delete("username");
      u.searchParams.delete("server");
      const qs = u.searchParams.toString();
      window.history.replaceState({}, "", qs ? `${u.pathname}?${qs}` : u.pathname);
    } catch {
      /* noop */
    }
  }, []);

  /** Same layout as /app: Streamly account without IPTV → connect provider there. */
  useEffect(() => {
    if (!cookieReady) return;
    if (creds) return;
    if (!streamlySignedIn) return;
    router.replace("/app");
  }, [cookieReady, creds, router, streamlySignedIn]);

  /** PIN tab is TV-only; once Streamly is signed in we never show it (avoid setState in an effect). */
  const activeTab: Tab = streamlySignedIn && tab === "pin" ? "xtream" : tab;

  async function submitPasswordLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      let creds: { server: string; username: string; password: string };
      if (activeTab === "m3u") {
        const parsed = tryParseM3uPortalUrl(m3u);
        if (!parsed) {
          throw new Error(
            "Could not parse M3U URL. It must include username and password params."
          );
        }
        creds = parsed;
      } else {
        if (!server || !username || !password) {
          throw new Error("Server, username and password are required.");
        }
        creds = {
          server: normalizeServer(server),
          username: username.trim(),
          password: password.trim(),
        };
      }

      if (needsClientTurnstile && !turnstileToken) {
        throw new Error("Complete the verification challenge, then try again.");
      }

      const account = await xtream.authenticate(creds, {
        turnstileToken: needsClientTurnstile ? turnstileToken ?? undefined : undefined,
      });
      if (!account?.user_info || account.user_info.auth !== 1) {
        throw new Error(
          account?.user_info?.message || "Login rejected by IPTV server."
        );
      }
      setCreds(creds);
      setAccount(account);
      writeAuthSessionBridge(creds, account);

      await persistIptvAfterBrowserLogin(creds);

      window.location.assign(`${window.location.origin}/app`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Login failed";
      setError(msg);
      setTurnstileToken(null);
      setTurnstileMountKey((k) => k + 1);
      setLoading(false);
    }
  }

  async function submitPinLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const digits = pin.replace(/\D/g, "");
    if (digits.length !== 6) {
      setError("Enter the 6-digit code from your phone or computer.");
      return;
    }
    setLoading(true);
    try {
      const redeem = await fetch(`${window.location.origin}/api/auth/pair/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ pin: digits }),
      });
      const redeemJson = (await redeem.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!redeem.ok) {
        throw new Error(redeemJson.error || `Link failed (${redeem.status})`);
      }

      const sess = await fetch(`${window.location.origin}/api/iptv/session`, {
        credentials: "include",
        cache: "no-store",
      });
      const data = (await sess.json()) as {
        creds?: { server: string; username: string; password: string } | null;
      };
      const creds = data.creds;
      if (!creds) {
        throw new Error("Session was not created. Try again.");
      }

      const account = await xtream.authenticate(creds, {});
      if (!account?.user_info || account.user_info.auth !== 1) {
        throw new Error(
          account?.user_info?.message || "IPTV server rejected this account."
        );
      }
      setCreds(creds);
      setAccount(account);
      writeAuthSessionBridge(creds, account);

      window.location.assign(`${window.location.origin}/app`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not link TV";
      setError(msg);
      setLoading(false);
    }
  }

  const showPinTab = !streamlySignedIn;
  const tabs = useMemo(() => {
    const pinTab = { id: "pin" as const, label: "Link with PIN" };
    const rest = [
      { id: "xtream" as const, label: "Xtream" },
      { id: "m3u" as const, label: "M3U URL" },
    ];
    if (!showPinTab) return rest;
    return [pinTab, ...rest];
  }, [showPinTab]);

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 size-[600px] bg-(--brand)/20 blur-[120px] rounded-full" />
        <div className="absolute -bottom-40 -left-40 size-[500px] bg-(--brand-2)/15 blur-[120px] rounded-full" />
      </div>

      <div className={cn("w-full", tv ? "max-w-xl" : "max-w-md")}>
        <div className="flex items-center gap-3 mb-6">
          <BrandMark size={11} />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight">
              {SITE_NAME}{" "}
              <span className="text-(--text-muted) font-normal">IPTV web player</span>
            </h1>
            <p className="text-xs text-(--text-muted) mt-0.5">{SITE_TAGLINE}</p>
          </div>
        </div>

        <p className="text-sm text-(--text-muted) leading-relaxed mb-6 max-w-prose">
          Live TV, movies, and series in the browser. Guide, search, layouts for phone and
          TV. Sign in with credentials from{" "}
          <strong className="text-(--text)">your</strong> Xtream or M3U provider.
        </p>

        <div className="card p-6 sm:p-7">
          <div className="mb-6 space-y-4">
            <StreamIdentityCard />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-(--bg-3) rounded-xl mb-6">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  setError(null);
                }}
                className={
                  "flex-1 min-w-[7rem] min-h-11 rounded-lg text-sm transition-colors px-2 py-2 " +
                  (activeTab === id
                    ? "bg-(--bg-1) text-(--text) shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
                    : "text-(--text-dim) hover:text-(--text)")
                }
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "pin" ? (
            <form onSubmit={submitPinLogin} className="space-y-5">
              <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-3 text-sm text-(--text-dim) leading-relaxed">
                On your <strong className="text-(--text)">phone or computer</strong>, open{" "}
                {SITE_NAME} → Settings →{" "}
                <strong className="text-(--text)">Link a TV with a PIN</strong>, then type
                the 6-digit code here.
              </div>

              <label className="block">
                <div className="flex items-center gap-2 text-xs text-(--text-dim) mb-2 font-medium">
                  <Hash className="size-4 text-(--text-muted)" aria-hidden />
                  6-digit code
                </div>
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="• • • • • •"
                  disabled={loading}
                  className={cn(
                    "w-full rounded-2xl bg-(--bg-3) border border-(--line) text-center font-mono tracking-[0.4em] text-(--text) placeholder:text-(--text-muted)/40 placeholder:tracking-normal outline-none focus:border-(--brand)/60 transition-colors",
                    tv ? "h-16 text-3xl px-4" : "h-14 text-2xl px-3"
                  )}
                  aria-label="Six digit pairing code"
                />
              </label>

              {error && (
                <div className="text-sm rounded-lg border border-(--danger)/30 bg-(--danger)/10 text-(--danger) px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || pin.replace(/\D/g, "").length !== 6}
                className="w-full h-12 rounded-xl btn-brand font-medium flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed text-base"
              >
                {loading ? (
                  <>
                    <span className="size-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Linking…
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="size-4" />
                  </>
                )}
              </button>

              <div className="flex items-center gap-2 text-[11px] text-(--text-muted) pt-1">
                <ShieldCheck className="size-3.5 shrink-0" />
                Each code works once and expires in about 10 minutes.
              </div>
            </form>
          ) : (
            <form onSubmit={submitPasswordLogin} className="space-y-4">
              {activeTab === "xtream" ? (
                <>
                  <Field
                    id="server"
                    icon={<LinkIcon className="size-4" />}
                    label="Server URL"
                    placeholder="http://your-server.tld[:port]"
                    value={server}
                    onChange={setServer}
                    autoComplete="url"
                  />
                  <Field
                    id="username"
                    icon={<AtSign className="size-4" />}
                    label="Username"
                    placeholder="your username"
                    value={username}
                    onChange={setUsername}
                    autoComplete="username"
                  />
                  <Field
                    id="password"
                    icon={<KeyRound className="size-4" />}
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={setPassword}
                    autoComplete="current-password"
                  />
                </>
              ) : (
                <Field
                  id="m3u"
                  icon={<LinkIcon className="size-4" />}
                  label="M3U URL"
                  placeholder="http://server/get.php?username=..&password=.."
                  value={m3u}
                  onChange={setM3u}
                />
              )}

              {needsClientTurnstile && (
                <div className="flex flex-col items-center gap-2 py-1">
                  <Turnstile
                    key={turnstileMountKey}
                    siteKey={TURNSTILE_SITE_KEY}
                    onSuccess={(t) => setTurnstileToken(t)}
                    onExpire={() => setTurnstileToken(null)}
                    options={{ theme: "dark" }}
                  />
                  {!turnstileToken && (
                    <p className="text-[11px] text-(--text-muted) text-center max-w-xs leading-snug">
                      Verification helps protect this app when the host enables it.
                    </p>
                  )}
                </div>
              )}

              {error && (
                <div className="text-sm rounded-lg border border-(--danger)/30 bg-(--danger)/10 text-(--danger) px-3 py-2">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || (needsClientTurnstile && !turnstileToken)}
                className="w-full h-11 rounded-xl btn-brand font-medium flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="size-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Signing in…
                  </>
                ) : (
                  <>
                    Continue
                    <ChevronRight className="size-4" />
                  </>
                )}
              </button>

              <div className="flex items-center gap-2 text-[11px] text-(--text-muted) pt-2">
                <ShieldCheck className="size-3.5" />
                Credentials stay on this device. Streams are proxied through this
                app to bypass CORS.
              </div>
            </form>
          )}
        </div>

        <UserContentDisclaimer className="mt-5" />

        <div className="mt-6 flex flex-col items-center gap-3 text-[11px] text-(--text-muted)">
          <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
            <Link
              href="/"
              className="min-h-11 inline-flex items-center underline underline-offset-2 hover:text-(--text)"
            >
              Home
            </Link>
            <Link
              href="/legal/terms"
              className="min-h-11 inline-flex items-center underline underline-offset-2 hover:text-(--text)"
            >
              Terms
            </Link>
            <Link
              href="/legal/privacy"
              className="min-h-11 inline-flex items-center underline underline-offset-2 hover:text-(--text)"
            >
              Privacy
            </Link>
            <Link
              href="/blog"
              className="min-h-11 inline-flex items-center underline underline-offset-2 hover:text-(--text)"
            >
              Blog
            </Link>
            <CommunityDiscordLink
              label="Discord"
              className="min-h-11 underline underline-offset-2 hover:text-(--text)"
            />
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-3 text-(--brand-2)" />
            iptvwebplayer.org
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPageFallback />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageFallback() {
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 size-[600px] bg-(--brand)/20 blur-[120px] rounded-full" />
        <div className="absolute -bottom-40 -left-40 size-[500px] bg-(--brand-2)/15 blur-[120px] rounded-full" />
      </div>
      <div
        className="size-8 border-2 border-(--line) border-t-(--brand) rounded-full animate-spin"
        aria-hidden
      />
    </div>
  );
}

function Field({
  id,
  label,
  icon,
  type = "text",
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  id: string;
  label: string;
  icon?: React.ReactNode;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  return (
    <label htmlFor={id} className="block">
      <div className="text-xs text-(--text-dim) mb-1.5 font-medium">{label}</div>
      <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-(--bg-3) border border-(--line) focus-within:border-(--brand)/60 transition-colors">
        {icon && <span className="text-(--text-muted)">{icon}</span>}
        <input
          id={id}
          name={id}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="bg-transparent outline-none w-full text-sm placeholder:text-(--text-muted)"
        />
      </div>
    </label>
  );
}
