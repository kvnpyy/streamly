"use client";

import { BrandMark } from "@/components/BrandMark";
import { UserContentDisclaimer } from "@/components/UserContentDisclaimer";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { detectTvBrowser } from "@/lib/tv-browser";
import {
  activateSavedProviderAccount,
  fetchSavedProviderAccounts,
} from "@/lib/provider-account-client";
import { persistIptvAfterBrowserLogin } from "@/lib/persist-iptv-session-client";
import { tryParseM3uPortalUrl } from "@/lib/provider-account-label";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-brand";
import { cn, normalizeServer } from "@/lib/utils";
import { xtream } from "@/lib/xtream";
import { writeAuthSessionBridge, useAuth } from "@/store/auth";
import {
  AtSign,
  ChevronRight,
  Hash,
  KeyRound,
  Link as LinkIcon,
  ShieldCheck,
  Sparkles,
  Tv,
} from "lucide-react";
import { Turnstile } from "@marsidev/react-turnstile";
import { signOutFully } from "@/lib/sign-out-client";
import { usePrefs } from "@/store/preferences";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type Tab = "xtream" | "m3u" | "pin";

const TURNSTILE_SITE_KEY =
  typeof process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY === "string"
    ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY.trim()
    : "";

export function StreamlyOnboardingConnect() {
  const { data: session } = useSession();
  const streamlySignedIn = Boolean(session?.user);
  const tv = useTvBrowser();
  const needsClientTurnstile = Boolean(TURNSTILE_SITE_KEY) && !tv;
  const setCreds = useAuth((s) => s.setCreds);
  const setAccount = useAuth((s) => s.setAccount);
  const setActiveSavedId = usePrefs((s) => s.setActiveSavedProviderAccountId);

  const [savedPlaylists, setSavedPlaylists] = useState<
    { id: string; label: string }[]
  >([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const [server, setServer] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

  /** Remount Turnstile when switching tabs - not on first paint (avoids DOM races with the widget). */
  useEffect(() => {
    const prev = prevTabRef.current;
    prevTabRef.current = tab;
    if (prev === undefined || prev === tab) return;
    queueMicrotask(() => {
      setTurnstileToken(null);
      setTurnstileMountKey((k) => k + 1);
    });
  }, [tab]);

  /** PIN tab is TV-only; once Streamly is signed in we never show it (avoid setState in an effect). */
  const activeTab: Tab = streamlySignedIn && tab === "pin" ? "xtream" : tab;

  useEffect(() => {
    let cancelled = false;
    if (!streamlySignedIn) {
      queueMicrotask(() => {
        if (!cancelled) {
          setSavedPlaylists([]);
          setSavedLoading(false);
          setSavedError(null);
        }
      });
      return () => {
        cancelled = true;
      };
    }
    queueMicrotask(() => {
      if (!cancelled) {
        setSavedLoading(true);
        setSavedError(null);
      }
    });
    void fetchSavedProviderAccounts()
      .then((rows) => {
        if (!cancelled) setSavedPlaylists(rows);
      })
      .catch((e) => {
        if (!cancelled) {
          setSavedPlaylists([]);
          setSavedError(
            e instanceof Error ? e.message : "Could not load saved playlists."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setSavedLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [streamlySignedIn]);

  async function activateSavedPlaylist(id: string) {
    setActivatingId(id);
    setSavedError(null);
    try {
      const { creds, account } = await activateSavedProviderAccount(id);
      setCreds(creds);
      if (account) setAccount(account);
      const merged = account ?? useAuth.getState().account;
      if (merged) writeAuthSessionBridge(creds, merged);
      setActiveSavedId(id);
    } catch (e) {
      setSavedError(e instanceof Error ? e.message : "Could not activate playlist.");
    } finally {
      setActivatingId(null);
    }
  }

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
      setLoading(false);
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
      setLoading(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not link TV";
      setError(msg);
      setLoading(false);
    }
  }

  const showPinTab = !streamlySignedIn;
  const tabs = useMemo(() => {
    const core = [
      { id: "xtream" as const, label: "Xtream" },
      { id: "m3u" as const, label: "M3U" },
    ];
    if (!showPinTab) return core;
    return [{ id: "pin" as const, label: "PIN" }, ...core];
  }, [showPinTab]);

  const email = session?.user?.email;

  return (
    <div className="relative w-full max-w-xl mx-auto">
      <div className="pointer-events-none absolute -top-24 -right-20 size-[420px] rounded-full bg-(--brand)/18 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-32 -left-16 size-[380px] rounded-full bg-(--brand-2)/14 blur-[90px]" />

      <div className="relative rounded-3xl border border-(--line) bg-(--bg-1)/80 backdrop-blur-xl shadow-[0_24px_80px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.04)] overflow-hidden ring-1 ring-(--brand)/15">
        <div className="p-6 sm:p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-(--brand)/30 to-(--brand-2)/20 border border-(--line) grid place-items-center shrink-0 shadow-lg">
              <Tv className="size-6 text-(--brand-2)" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <BrandMark size={9} />
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md bg-(--brand)/15 text-(--brand-2) border border-(--brand)/25">
                  Step 1
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-(--text) mt-2">
                Connect your provider
              </h1>
              <p className="text-sm text-(--text-muted) mt-1.5 leading-relaxed">
                You&apos;re signed in to {SITE_NAME}
                {email ? (
                  <>
                    {" "}
                    as <span className="text-(--text) font-medium">{email}</span>
                  </>
                ) : null}
                . Add your IPTV library here — your guide, movies, and live channels
                will appear in this layout as soon as we validate the account.
              </p>
            </div>
          </div>

          {streamlySignedIn && (savedLoading || savedPlaylists.length > 0 || savedError) ? (
            <div className="mb-6 rounded-xl border border-(--brand)/25 bg-(--brand)/[0.05] p-4">
              <p className="text-sm font-semibold text-(--text) mb-1">
                Your saved playlists
              </p>
              <p className="text-xs text-(--text-dim) mb-3 leading-relaxed">
                Pick a playlist from your Streamly account — no need to re-enter credentials on
                this device.
              </p>
              {savedError && (
                <div className="text-xs rounded-lg border border-(--danger)/25 bg-(--danger)/10 text-(--danger) px-3 py-2 mb-3">
                  {savedError}
                </div>
              )}
              {savedLoading ? (
                <div className="flex items-center gap-2 text-xs text-(--text-muted) py-1">
                  <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Loading saved playlists…
                </div>
              ) : (
                <div className="space-y-1.5">
                  {savedPlaylists.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      disabled={activatingId !== null}
                      onClick={() => void activateSavedPlaylist(row.id)}
                      className="w-full text-left rounded-lg border border-(--line) bg-(--bg-2)/80 px-3 py-2.5 text-sm text-(--text) hover:border-(--brand)/40 transition-colors disabled:opacity-55 flex items-center justify-between gap-2"
                    >
                      <span className="truncate font-medium">{row.label}</span>
                      {activatingId === row.id ? (
                        <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin shrink-0" />
                      ) : (
                        <ChevronRight className="size-4 text-(--text-muted) shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-(--text-muted) mt-3">
                Or connect a different provider below.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1 p-1 bg-(--bg-3) rounded-xl mb-6">
            {tabs.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setTab(id);
                  setError(null);
                }}
                className={cn(
                  "flex-1 min-w-[5.5rem] min-h-11 rounded-lg text-sm font-medium transition-colors px-2 py-2",
                  activeTab === id
                    ? "bg-(--bg-1) text-(--text) shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                    : "text-(--text-dim) hover:text-(--text)"
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {activeTab === "pin" ? (
            <form onSubmit={submitPinLogin} className="space-y-5">
              <div className="rounded-xl border border-(--line) bg-(--bg-3)/80 px-4 py-3 text-sm text-(--text-dim) leading-relaxed">
                On another device where you&apos;re already logged in, open{" "}
                <strong className="text-(--text)">{SITE_NAME}</strong> ? Settings ?{" "}
                <strong className="text-(--text)">Link a TV with a PIN</strong>, then
                enter the code here.
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
                    Linking
                  </>
                ) : (
                  <>
                    Connect library
                    <ChevronRight className="size-4" />
                  </>
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={submitPasswordLogin} className="space-y-4">
              {activeTab === "xtream" ? (
                <>
                  <OnboardingField
                    id="onb-server"
                    icon={<LinkIcon className="size-4" />}
                    label="Server URL"
                    placeholder="http://your-server.tld[:port]"
                    value={server}
                    onChange={setServer}
                    autoComplete="url"
                  />
                  <OnboardingField
                    id="onb-username"
                    icon={<AtSign className="size-4" />}
                    label="Username"
                    placeholder="your username"
                    value={username}
                    onChange={setUsername}
                    autoComplete="username"
                  />
                  <OnboardingField
                    id="onb-password"
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
                <OnboardingField
                  id="onb-m3u"
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
                disabled={
                  loading || (needsClientTurnstile && !turnstileToken)
                }
                className="w-full h-11 rounded-xl btn-brand font-medium flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <span className="size-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Connecting
                  </>
                ) : (
                  <>
                    Connect library
                    <ChevronRight className="size-4" />
                  </>
                )}
              </button>

              <div className="flex items-center gap-2 text-[11px] text-(--text-muted) pt-1">
                <ShieldCheck className="size-3.5 shrink-0" />
                Credentials stay on this device; streams are proxied to bypass CORS.
              </div>
            </form>
          )}

          <div className="mt-6 pt-5 border-t border-(--line) flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <button
              type="button"
              onClick={() =>
                void signOutFully().then(() => {
                  window.location.assign("/login");
                })
              }
              className="text-xs text-(--text-muted) hover:text-(--text) underline underline-offset-2 min-h-11 text-left"
            >
              Sign out and use a different account
            </button>
            <div className="flex items-center gap-2 text-[11px] text-(--text-muted)">
              <Sparkles className="size-3 text-(--brand-2)" />
              <span>{SITE_TAGLINE}</span>
            </div>
          </div>
        </div>
      </div>

      <UserContentDisclaimer className="mt-6" />

      <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[11px] text-(--text-muted)">
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
      </div>
    </div>
  );
}

function OnboardingField({
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
