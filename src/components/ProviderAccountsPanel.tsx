"use client";

import {
  activateSavedProviderAccount,
  fetchSavedProviderAccounts,
  type SavedProviderAccountRow as Row,
} from "@/lib/provider-account-client";
import {
  isStaleStreamSessionStatus,
  signOutFully,
} from "@/lib/sign-out-client";
import { providerLabelFromCreds } from "@/lib/provider-account-label";
import { normalizeServer } from "@/lib/utils";
import { useAuth, writeAuthSessionBridge } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronUp,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  Radio,
  Save,
  Trash2,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export function ProviderAccountsPanel() {
  const router = useRouter();
  const { status } = useSession();
  const qc = useQueryClient();
  const setCreds = useAuth((s) => s.setCreds);
  const setAccount = useAuth((s) => s.setAccount);
  const activeSavedId = usePrefs((s) => s.activeSavedProviderAccountId);
  const setActiveSavedId = usePrefs((s) => s.setActiveSavedProviderAccountId);
  /** Active IPTV credentials from Zustand (may be session-cookie-only, not in DB). */
  const activeCreds = useAuth((s) => s.creds);

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addServer, setAddServer] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState<string | null>(null);
  const serverInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (status !== "authenticated") return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchSavedProviderAccounts());
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Network error loading accounts.");
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(t);
  }, [load]);

  useEffect(() => {
    if (showAddForm) {
      setTimeout(() => serverInputRef.current?.focus(), 50);
    }
  }, [showAddForm]);

  const resetAddForm = useCallback(() => {
    setAddServer("");
    setAddUsername("");
    setAddPassword("");
    setAddLabel("");
    setAddError(null);
    setAddSuccess(null);
    setShowPassword(false);
  }, []);

  const closeAddForm = useCallback(() => {
    setShowAddForm(false);
    resetAddForm();
  }, [resetAddForm]);

  if (status !== "authenticated") return null;

  async function activate(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const { creds, account } = await activateSavedProviderAccount(id);
      setCreds(creds);
      if (account) setAccount(account);
      const merged = account ?? useAuth.getState().account;
      if (merged) writeAuthSessionBridge(creds, merged);
      setActiveSavedId(id);
      await qc.invalidateQueries();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Activate failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string, label: string) {
    if (!window.confirm(`Remove "${label}" from saved playlists?`)) return;
    setBusyId(id);
    setError(null);
    try {
      const r = await fetch(
        `${window.location.origin}/api/provider-accounts/${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Delete failed.");
        return;
      }
      if (activeSavedId === id) setActiveSavedId(null);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function renameAccount(id: string, current: string) {
    const next = window.prompt("Playlist name", current)?.trim();
    if (!next || next === current) return;
    setBusyId(id);
    setError(null);
    try {
      const r = await fetch(
        `${window.location.origin}/api/provider-accounts/${encodeURIComponent(id)}`,
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: next }),
        }
      );
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Rename failed.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    setAddSuccess(null);

    const server = normalizeServer(addServer);
    const username = addUsername.trim();
    const password = addPassword;
    const label = addLabel.trim() || providerLabelFromCreds({ server, username });

    if (!server) {
      setAddError("Server URL is required.");
      return;
    }
    if (!username || !password) {
      setAddError("Username and password are required.");
      return;
    }

    setAddBusy(true);
    try {
      const r = await fetch(`${window.location.origin}/api/provider-accounts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ label, creds: { server, username, password } }),
      });
      const data = (await r.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!r.ok) {
        if (isStaleStreamSessionStatus(r.status)) {
          await signOutFully();
          setAddError(
            data.error ||
              "Your sign-in is no longer valid. Sign in again to save playlists."
          );
          router.replace("/login?stale=1");
          return;
        }
        setAddError(data.error || `Failed to add playlist (${r.status}).`);
        return;
      }

      const newId = data.id;
      setAddSuccess("Playlist added successfully!");
      resetAddForm();

      await load();

      // Auto-activate if it's the first one, or activate the newly added one
      if (newId) {
        await activate(newId);
        await qc.invalidateQueries({ queryKey: ["saved-provider-accounts"] });
      }

      setTimeout(() => {
        closeAddForm();
      }, 1200);
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Network error. Try again.");
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <section id="playlists" className="card p-5 scroll-mt-24">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Radio className="size-4 text-(--brand)" />
          <h3 className="text-base font-semibold">Saved playlists</h3>
          {rows.length > 0 && (
            <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-(--brand)/12 text-(--brand)">
              {rows.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={showAddForm ? closeAddForm : () => setShowAddForm(true)}
          className="shrink-0 h-8 px-3 rounded-lg btn-brand text-xs font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
          disabled={addBusy}
        >
          {showAddForm ? (
            <>
              <ChevronUp className="size-3.5" /> Cancel
            </>
          ) : (
            <>
              <Plus className="size-3.5" /> Add playlist
            </>
          )}
        </button>
      </div>
      <p className="text-sm text-(--text-dim) mb-4">
        Encrypted on this server. Switch between providers without re-entering credentials.
      </p>

      {/* ── "Save current connection" nudge ────────────────────────────────
          Shown when the user is authenticated but has no saved playlists yet
          AND there is an active IPTV session. This covers the common case where
          someone connected their provider before signing into Streamly, so the
          credentials are in a session cookie but not saved to the DB.        */}
      {!loading && rows.length === 0 && activeCreds && !showAddForm && (
        <div className="mb-4 rounded-xl border border-(--brand)/25 bg-(--brand)/[0.05] px-4 py-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-(--text)">
              You&rsquo;re connected but not saved
            </p>
            <p className="text-xs text-(--text-dim) mt-0.5 truncate">
              {activeCreds.username}@{activeCreds.server} — save this connection so you can
              switch playlists without re-entering credentials.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setAddServer(activeCreds.server);
              setAddUsername(activeCreds.username);
              setShowAddForm(true);
            }}
            className="shrink-0 h-8 px-3 rounded-lg btn-brand text-xs font-medium inline-flex items-center gap-1.5"
          >
            <Save className="size-3.5" />
            Save connection
          </button>
        </div>
      )}

      {showAddForm && (
        <form
          onSubmit={(e) => void handleAddSubmit(e)}
          className="mb-5 rounded-xl border border-(--brand)/25 bg-(--brand)/[0.04] p-4 space-y-3"
        >
          <div className="text-sm font-semibold text-(--text) mb-0.5 flex items-center gap-2">
            <Plus className="size-3.5 text-(--brand)" />
            Add new playlist
          </div>

          {addError && (
            <div className="text-xs rounded-lg border border-(--danger)/25 bg-(--danger)/10 text-(--danger) px-3 py-2">
              {addError}
            </div>
          )}
          {addSuccess && (
            <div className="text-xs rounded-lg border border-green-500/25 bg-green-500/10 text-green-400 px-3 py-2 flex items-center gap-2">
              <Check className="size-3.5" /> {addSuccess}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs text-(--text-muted) mb-1 font-medium">
                Server URL
              </label>
              <input
                ref={serverInputRef}
                type="text"
                value={addServer}
                onChange={(e) => setAddServer(e.target.value)}
                placeholder="http://provider.com:8080"
                autoComplete="off"
                disabled={addBusy}
                className="w-full h-10 px-3 rounded-lg bg-(--bg-3) border border-(--line) text-sm focus:border-(--brand)/50 outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs text-(--text-muted) mb-1 font-medium">
                Username
              </label>
              <input
                type="text"
                value={addUsername}
                onChange={(e) => setAddUsername(e.target.value)}
                placeholder="username"
                autoComplete="username"
                disabled={addBusy}
                className="w-full h-10 px-3 rounded-lg bg-(--bg-3) border border-(--line) text-sm focus:border-(--brand)/50 outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label className="block text-xs text-(--text-muted) mb-1 font-medium">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={addPassword}
                  onChange={(e) => setAddPassword(e.target.value)}
                  placeholder="password"
                  autoComplete="current-password"
                  disabled={addBusy}
                  className="w-full h-10 px-3 pr-9 rounded-lg bg-(--bg-3) border border-(--line) text-sm focus:border-(--brand)/50 outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-(--text-muted) hover:text-(--text)"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-(--text-muted) mb-1 font-medium">
                Name{" "}
                <span className="text-(--text-muted) font-normal">(optional — auto-generated if blank)</span>
              </label>
              <input
                type="text"
                value={addLabel}
                onChange={(e) => setAddLabel(e.target.value)}
                placeholder="e.g. My IPTV"
                autoComplete="off"
                disabled={addBusy}
                className="w-full h-10 px-3 rounded-lg bg-(--bg-3) border border-(--line) text-sm focus:border-(--brand)/50 outline-none disabled:opacity-60"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={addBusy}
            className="min-h-10 px-5 rounded-lg btn-brand text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {addBusy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Verifying & saving…
              </>
            ) : (
              <>
                <Plus className="size-4" />
                Add playlist
              </>
            )}
          </button>
          <p className="text-xs text-(--text-muted)">
            Credentials are verified with your provider and encrypted before being stored.
          </p>
        </form>
      )}

      {error && (
        <div className="text-sm rounded-lg border border-(--danger)/25 bg-(--danger)/10 text-(--danger) px-3 py-2 mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-(--text-muted) py-4">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-6 text-sm text-(--text-muted)">
          <Radio className="size-8 mx-auto mb-2 opacity-25" />
          <p>No saved playlists yet.</p>
          <p className="text-xs mt-1 opacity-75">
            Click <strong>Add playlist</strong> above to get started.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => {
            const isActive = activeSavedId === row.id;
            return (
              <li
                key={row.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                  isActive
                    ? "border-(--brand)/35 bg-(--brand)/[0.07]"
                    : "border-(--line) bg-(--bg-3)/60"
                }`}
              >
                <div className="min-w-0 flex-1 flex items-center gap-2.5">
                  {isActive ? (
                    <span className="shrink-0 size-5 rounded-full bg-(--brand) flex items-center justify-center">
                      <Check className="size-3 text-white" />
                    </span>
                  ) : (
                    <span className="shrink-0 size-5 rounded-full border border-(--line-2) bg-(--bg-2)" />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-(--text) truncate">
                      {row.label}
                    </div>
                    {isActive && (
                      <div className="text-[11px] text-(--brand) font-medium">Active</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0 pl-7 sm:pl-0">
                  {!isActive && (
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => void activate(row.id)}
                      className="h-8 px-3 rounded-lg btn-brand text-xs font-medium disabled:opacity-50"
                    >
                      {busyId === row.id ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        "Use"
                      )}
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void renameAccount(row.id, row.label)}
                    className="h-8 px-3 rounded-lg bg-(--bg-2) border border-(--line) text-xs hover:border-(--line-2) disabled:opacity-50"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => void remove(row.id, row.label)}
                    className="h-8 px-3 rounded-lg bg-(--danger)/12 border border-(--danger)/25 text-(--danger) text-xs hover:bg-(--danger)/18 disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    <Trash2 className="size-3.5" /> Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
