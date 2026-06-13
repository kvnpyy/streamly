"use client";

import { LiveCategorySortSection } from "@/components/LiveCategorySortSection";
import { CommunityDiscordLink } from "@/components/CommunityDiscordLink";
import { MarketingEmailPreferences } from "@/components/MarketingEmailPreferences";
import { ProviderAccountsPanel } from "@/components/ProviderAccountsPanel";
import { SectionHeader } from "@/components/SectionHeader";
import { TvPairingCard } from "@/components/TvPairingCard";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { UserContentDisclaimer } from "@/components/UserContentDisclaimer";
import { formatDate } from "@/lib/utils";
import { feedbackFormUrlWithContext } from "@/lib/feedback-url";
import { SITE_NAME } from "@/lib/site-brand";
import { signOutFully } from "@/lib/sign-out-client";
import { useAuth } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { Lock, MonitorPlay, ShieldCheck, ShieldOff, Unlock } from "lucide-react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export default function SettingsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const tv = useTvBrowser();
  const { data: streamSession, status: streamSessionStatus } = useSession();
  const streamSignedIn =
    streamSessionStatus === "authenticated" && !!streamSession?.user?.id;
  const { creds, account } = useAuth();
  const {
    favorites,
    recents,
    clearRecents,
    hideAdult,
    setHideAdult,
    parentalPin,
    setParentalPin,
    parentalUnlocked,
    unlockParental,
    lockParental,
    comfortTvBrowsing,
    setComfortTvBrowsing,
    resetAllPrefs,
  } = usePrefs();

  return (
    <div className="space-y-6 max-w-3xl">
      <SectionHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your IPTV account, content filters, and storage."
      />

      <section className="card p-5">
        <h3 className="text-base font-semibold mb-4">Account</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <Row label="Server" value={creds?.server || "—"} />
          <Row label="Username" value={creds?.username || "—"} />
          <Row label="Status" value={account?.user_info.status || "—"} />
          <Row
            label="Max connections"
            value={account?.user_info.max_connections || "—"}
          />
          <Row
            label="Trial"
            value={account?.user_info.is_trial === "1" ? "Yes" : "No"}
          />
          <Row
            label="Expires"
            value={
              account?.user_info.exp_date
                ? formatDate(account.user_info.exp_date)
                : "Never / Unknown"
            }
          />
          <Row label="Server time" value={account?.server_info.time_now || "—"} />
          <Row
            label="Allowed formats"
            value={account?.user_info.allowed_output_formats?.join(", ") || "—"}
          />
        </dl>
      </section>

      <TvPairingCard />

      <ProviderAccountsPanel />

      {streamSignedIn && <MarketingEmailPreferences />}

      <LiveCategorySortSection />

      <section className="card p-5">
        <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
          <MonitorPlay className="size-4 text-(--brand)" />
          TV & couch UI
        </h3>
        <p className="text-sm text-(--text-dim) mb-4">
          Smart TVs use a tighter layout by default so the sidebar stays compact and content
          gets more space. Turn this on if you want larger text and tap targets (projectors,
          sitting far away).
        </p>
        <Toggle
          label="Comfort layout"
          description="Larger text, TV-style home hub, and grid shelves when browsing from the couch."
          value={comfortTvBrowsing}
          onChange={setComfortTvBrowsing}
        />
      </section>

      <ParentalControls
        hideAdult={hideAdult}
        setHideAdult={setHideAdult}
        parentalPin={parentalPin}
        setParentalPin={setParentalPin}
        parentalUnlocked={parentalUnlocked}
        unlockParental={unlockParental}
        lockParental={lockParental}
      />

      <section className="card p-5">
        <h3 className="text-base font-semibold mb-3">Data</h3>
        <div className="text-sm text-(--text-dim)">
          {favorites.length} in My List · {recents.length} in continue watching
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button
            type="button"
            onClick={clearRecents}
            className="min-h-11 px-4 rounded-lg bg-(--bg-3) border border-(--line) hover:border-(--line-2) text-sm inline-flex items-center justify-center"
          >
            Clear continue watching
          </button>
          <button
            type="button"
            onClick={async () => {
              await signOutFully();
              router.replace("/login");
            }}
            className="min-h-11 px-4 rounded-lg bg-(--danger)/15 border border-(--danger)/30 text-(--danger) text-sm hover:bg-(--danger)/20 inline-flex items-center justify-center"
          >
            Sign out
          </button>
        </div>
      </section>

      {streamSignedIn && (
        <DeleteStreamAccountCard
          onSuccess={async () => {
            await signOutFully();
            try {
              usePrefs.persist.clearStorage();
            } catch {
              /* noop */
            }
            resetAllPrefs();
            router.replace("/login");
          }}
        />
      )}

      <section className="card p-5">
        <h3 className="text-base font-semibold mb-2">Community</h3>
        <p className="text-sm text-(--text-dim) mb-4 leading-relaxed">
          Join the {SITE_NAME} Discord for setup help, release notes, and chat with
          other users. Email is still best for account and privacy requests.
        </p>
        <div className="flex flex-wrap gap-2">
          <CommunityDiscordLink
            label="Join Discord"
            className="min-h-11 px-4 rounded-lg bg-[#5865F2]/15 border border-[#5865F2]/35 hover:border-[#5865F2]/55 text-sm font-medium text-[#c7ceff]"
          />
          <a
            href={feedbackFormUrlWithContext({
              surface: "settings",
              pathname,
              tvBrowser: tv,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 px-4 rounded-lg bg-(--bg-3) border border-(--line) hover:border-(--line-2) text-sm inline-flex items-center"
          >
            Send feedback
          </a>
        </div>
      </section>

      <section className="card p-5">
        <h3 className="text-base font-semibold mb-2">Legal</h3>
        <p className="text-sm text-(--text-dim) mb-4 leading-relaxed">
          How {SITE_NAME} describes hosting and data handling before you open the app to
          others.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/legal/terms"
            className="min-h-11 px-4 rounded-lg bg-(--bg-3) border border-(--line) hover:border-(--line-2) text-sm inline-flex items-center"
          >
            Terms of Service
          </Link>
          <Link
            href="/legal/privacy"
            className="min-h-11 px-4 rounded-lg bg-(--bg-3) border border-(--line) hover:border-(--line-2) text-sm inline-flex items-center"
          >
            Privacy Policy
          </Link>
        </div>
      </section>

      <section className="card p-5">
        <h3 className="text-base font-semibold mb-2">About</h3>
        <p className="text-sm text-(--text-dim) leading-relaxed">
          {SITE_NAME} is a fast, modern IPTV client built with Next.js 16, React 19,
          and HLS.js. It speaks the Xtream Codes API and proxies media through this
          server to avoid CORS and mixed-content issues. Optional {SITE_NAME} accounts
          store IPTV credentials encrypted on this server; playback still talks to
          your provider through our proxy.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/changelog"
            className="min-h-11 px-4 rounded-lg bg-(--bg-3) border border-(--line) hover:border-(--line-2) text-sm inline-flex items-center"
          >
            What&apos;s new
          </Link>
          <Link
            href="/blog"
            className="min-h-11 px-4 rounded-lg bg-(--bg-3) border border-(--line) hover:border-(--line-2) text-sm inline-flex items-center"
          >
            Guides &amp; blog
          </Link>
        </div>
        <UserContentDisclaimer className="mt-4" />
      </section>
    </div>
  );
}

function DeleteStreamAccountCard({
  onSuccess,
}: {
  onSuccess: () => Promise<void>;
}) {
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  return (
    <section className="card p-5 border border-(--danger)/20 bg-(--danger)/[0.03]">
      <h3 className="text-base font-semibold mb-1 text-(--danger)">
        Delete {SITE_NAME} account
      </h3>
      <p className="text-sm text-(--text-dim) mb-4 leading-relaxed">
        Removes your {SITE_NAME} login and every saved IPTV profile stored encrypted on
        this server, clears the IPTV session cookie on this browser, and wipes local
        favorites/recents/prefs here. This does not cancel billing with your IPTV
        provider.
      </p>
      <label className="block text-xs text-(--text-muted) mb-1.5 font-medium">
        Type <span className="text-(--text) font-mono">DELETE</span> to confirm
      </label>
      <input
        type="text"
        autoComplete="off"
        value={phrase}
        onChange={(e) => setPhrase(e.target.value)}
        placeholder="DELETE"
        disabled={busy}
        className="w-full max-w-xs min-h-11 px-3 rounded-lg bg-(--bg-3) border border-(--line) text-sm outline-none focus:border-(--danger)/50 mb-3"
      />
      {err && (
        <div className="text-sm text-(--danger) mb-3 rounded-lg border border-(--danger)/30 bg-(--danger)/10 px-3 py-2">
          {err}
        </div>
      )}
      <button
        type="button"
        disabled={busy || phrase !== "DELETE"}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            const res = await fetch(`${window.location.origin}/api/account`, {
              method: "DELETE",
              credentials: "include",
            });
            const body = (await res.json().catch(() => ({}))) as {
              error?: string;
            };
            if (!res.ok) {
              throw new Error(body.error || `Request failed (${res.status})`);
            }
            await onSuccess();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not delete account");
          } finally {
            setBusy(false);
          }
        }}
        className="min-h-11 px-4 rounded-lg bg-(--danger)/20 border border-(--danger)/35 text-(--danger) text-sm font-medium hover:bg-(--danger)/25 disabled:opacity-50 disabled:pointer-events-none inline-flex items-center justify-center gap-2"
      >
        {busy ? (
          <>
            <span className="size-4 border-2 border-(--danger)/40 border-t-(--danger) rounded-full animate-spin" />
            Deleting…
          </>
        ) : (
          "Delete account permanently"
        )}
      </button>
    </section>
  );
}

function ParentalControls({
  hideAdult,
  setHideAdult,
  parentalPin,
  setParentalPin,
  parentalUnlocked,
  unlockParental,
  lockParental,
}: {
  hideAdult: boolean;
  setHideAdult: (v: boolean) => void;
  parentalPin: string | null;
  setParentalPin: (pin: string | null) => void;
  parentalUnlocked: boolean;
  unlockParental: (pin: string) => boolean;
  lockParental: () => void;
}) {
  const [pinInput, setPinInput] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <section className="card p-5">
      <h3 className="text-base font-semibold mb-1 flex items-center gap-2">
        <ShieldCheck className="size-4 text-(--brand-2)" />
        Parental controls
      </h3>
      <p className="text-sm text-(--text-dim) mb-4">
        Hide adult categories and channels from browsing. Optional PIN locks
        the toggle so it can&apos;t be disabled without the code.
      </p>

      <Toggle
        label="Hide adult content"
        description="Filters categories and items that look like adult/XXX content."
        value={hideAdult}
        onChange={(v) => {
          if (parentalPin && !parentalUnlocked && hideAdult && !v) {
            setMsg("Enter the PIN below to unlock first.");
            return;
          }
          setHideAdult(v);
        }}
      />

      {/* PIN management */}
      <div className="mt-5 pt-5 border-t border-(--line) space-y-4">
        {parentalPin ? (
          <>
            <div className="text-sm flex items-center gap-2 text-(--text)">
              {parentalUnlocked ? (
                <>
                  <Unlock className="size-4 text-(--brand-2)" /> PIN currently
                  unlocked for this session
                </>
              ) : (
                <>
                  <Lock className="size-4 text-(--text-muted)" /> PIN protected
                </>
              )}
            </div>
            {!parentalUnlocked && (
              <div className="flex flex-col sm:flex-row gap-2 max-w-md">
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={8}
                  value={pinInput}
                  onChange={(e) =>
                    setPinInput(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Enter PIN"
                  className="h-10 px-3 rounded-lg bg-(--bg-3) border border-(--line) text-sm focus:border-(--brand)/50 outline-none flex-1"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (unlockParental(pinInput)) {
                      setMsg("Unlocked for this session.");
                      setPinInput("");
                    } else {
                      setMsg("Wrong PIN.");
                    }
                  }}
                  className="min-h-11 px-4 rounded-lg btn-brand text-sm inline-flex items-center justify-center"
                >
                  Unlock
                </button>
              </div>
            )}
            {parentalUnlocked && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    lockParental();
                    setMsg("Locked.");
                  }}
                  className="min-h-11 px-4 rounded-lg bg-(--bg-3) border border-(--line) hover:border-(--line-2) text-sm flex items-center gap-2"
                >
                  <Lock className="size-3.5" /> Lock
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setParentalPin(null);
                    setMsg("PIN removed.");
                  }}
                  className="min-h-11 px-4 rounded-lg bg-(--danger)/15 border border-(--danger)/30 text-(--danger) text-sm flex items-center gap-2"
                >
                  <ShieldOff className="size-3.5" /> Remove PIN
                </button>
              </div>
            )}
          </>
        ) : (
          <div>
            <div className="text-sm text-(--text) mb-2">Set a 4–8 digit PIN</div>
            <div className="flex flex-col sm:flex-row gap-2 max-w-md">
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                placeholder="New PIN"
                className="h-10 px-3 rounded-lg bg-(--bg-3) border border-(--line) text-sm focus:border-(--brand)/50 outline-none flex-1"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={confirmPin}
                onChange={(e) =>
                  setConfirmPin(e.target.value.replace(/\D/g, ""))
                }
                placeholder="Confirm PIN"
                className="h-10 px-3 rounded-lg bg-(--bg-3) border border-(--line) text-sm focus:border-(--brand)/50 outline-none flex-1"
              />
              <button
                type="button"
                onClick={() => {
                  if (newPin.length < 4) {
                    setMsg("PIN must be at least 4 digits.");
                    return;
                  }
                  if (newPin !== confirmPin) {
                    setMsg("PINs don't match.");
                    return;
                  }
                  setParentalPin(newPin);
                  setNewPin("");
                  setConfirmPin("");
                  setMsg("PIN set.");
                }}
                className="min-h-11 px-4 rounded-lg btn-brand text-sm inline-flex items-center justify-center"
              >
                Save
              </button>
            </div>
          </div>
        )}
        {msg && <div className="text-xs text-(--text-dim)">{msg}</div>}
      </div>
    </section>
  );
}

function Toggle({
  label,
  description,
  value,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={
        "flex items-start justify-between gap-4 select-none " +
        (disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer")
      }
    >
      <div className="min-w-0">
        <div className="text-sm text-(--text)">{label}</div>
        {description && (
          <div className="text-xs text-(--text-dim) mt-0.5">{description}</div>
        )}
      </div>
      <span className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={value}
          disabled={disabled}
          onClick={() => !disabled && onChange(!value)}
          className={
            "relative h-7 w-12 rounded-full transition-colors ring-1 ring-inset disabled:pointer-events-none " +
            (value
              ? "bg-(--brand) ring-(--brand)"
              : "bg-(--bg-3) ring-(--line)")
          }
        >
          <span
            className={
              "absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-sm transition-transform " +
              (value ? "translate-x-5" : "translate-x-0")
            }
          />
        </button>
      </span>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-(--text-muted)">{label}</dt>
      <dd className="text-(--text) truncate">{value}</dd>
    </>
  );
}
