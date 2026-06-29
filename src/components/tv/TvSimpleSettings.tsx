"use client";

import { TvFocusRoot } from "@/components/tv/TvFocusRoot";
import { TvSpatialGrid } from "@/components/TvSpatialGrid";
import {
  activateSavedProviderAccount,
  fetchSavedProviderAccounts,
  type SavedProviderAccountRow,
} from "@/lib/provider-account-client";
import { providerLabelFromCreds } from "@/lib/provider-account-label";
import { signOutFully, isStaleStreamSessionStatus } from "@/lib/sign-out-client";
import { formatDate, normalizeServer } from "@/lib/utils";
import { useAuth, writeAuthSessionBridge } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  Loader2,
  LogOut,
  Plus,
  Radio,
  ShieldCheck,
  User,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type SettingsView = "menu" | "playlists" | "account" | "parental" | "add-playlist";

export function TvSimpleSettings() {
  const router = useRouter();
  const qc = useQueryClient();
  const { status } = useSession();
  const streamSignedIn = status === "authenticated";
  const { creds, account } = useAuth();
  const setCreds = useAuth((s) => s.setCreds);
  const setAccount = useAuth((s) => s.setAccount);
  const activeSavedId = usePrefs((s) => s.activeSavedProviderAccountId);
  const setActiveSavedId = usePrefs((s) => s.setActiveSavedProviderAccountId);
  const {
    hideAdult,
    setHideAdult,
    clearRecents,
  } = usePrefs();

  const [view, setView] = useState<SettingsView>("menu");
  const [rows, setRows] = useState<SavedProviderAccountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [addServer, setAddServer] = useState("");
  const [addUsername, setAddUsername] = useState("");
  const [addPassword, setAddPassword] = useState("");
  const [addLabel, setAddLabel] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const loadPlaylists = useCallback(async () => {
    if (!streamSignedIn) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchSavedProviderAccounts());
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : "Could not load playlists.");
    } finally {
      setLoading(false);
    }
  }, [streamSignedIn]);

  useEffect(() => {
    if (!streamSignedIn) {
      const id = window.setTimeout(() => setRows([]), 0);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => {
      void loadPlaylists();
    }, 0);
    return () => window.clearTimeout(id);
  }, [streamSignedIn, loadPlaylists]);

  useEffect(() => {
    if (view !== "playlists") return;
    const id = window.setTimeout(() => {
      void loadPlaylists();
    }, 0);
    return () => window.clearTimeout(id);
  }, [view, loadPlaylists]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.hash === "#playlists") {
      setView("playlists");
    }
  }, []);

  async function activatePlaylist(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const { creds: nextCreds, account: nextAccount } =
        await activateSavedProviderAccount(id);
      setCreds(nextCreds);
      if (nextAccount) setAccount(nextAccount);
      const merged = nextAccount ?? useAuth.getState().account;
      if (merged) writeAuthSessionBridge(nextCreds, merged);
      setActiveSavedId(id);
      await qc.invalidateQueries();
      await loadPlaylists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch playlist.");
    } finally {
      setBusyId(null);
    }
  }

  async function saveRename(id: string) {
    const next = renameValue.trim();
    if (!next) return;
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
        throw new Error(data.error || "Rename failed.");
      }
      setRenamingId(null);
      setRenameValue("");
      await loadPlaylists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function deletePlaylist(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const r = await fetch(
        `${window.location.origin}/api/provider-accounts/${encodeURIComponent(id)}`,
        { method: "DELETE", credentials: "include" }
      );
      if (!r.ok) {
        const data = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Delete failed.");
      }
      if (activeSavedId === id) setActiveSavedId(null);
      setConfirmDeleteId(null);
      await loadPlaylists();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusyId(null);
    }
  }

  async function submitAddPlaylist(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const server = normalizeServer(addServer);
    const username = addUsername.trim();
    const password = addPassword;
    const label =
      addLabel.trim() || providerLabelFromCreds({ server, username });

    if (!server || !username || !password) {
      setAddError("Server, username, and password are required.");
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
          router.replace("/login?stale=1");
          return;
        }
        throw new Error(data.error || `Failed to add playlist (${r.status}).`);
      }
      if (data.id) await activatePlaylist(data.id);
      setAddServer("");
      setAddUsername("");
      setAddPassword("");
      setAddLabel("");
      setView("playlists");
    } catch (e) {
      setAddError(e instanceof Error ? e.message : "Could not add playlist.");
    } finally {
      setAddBusy(false);
    }
  }

  if (view === "menu") {
    return (
      <TvFocusRoot className="tv-settings">
        <p className="tv-simple-browse__lead">Settings</p>
        <nav className="tv-settings__menu" aria-label="Settings sections">
          <button
            type="button"
            data-tv-card-root
            className="tv-settings__tile focus-ring"
            onClick={() => setView("playlists")}
          >
            <Radio className="tv-settings__tile-icon" aria-hidden />
            <span className="tv-settings__tile-label">Playlists</span>
            <span className="tv-settings__tile-hint">Switch, add, or rename</span>
          </button>
          <button
            type="button"
            data-tv-card-root
            className="tv-settings__tile focus-ring"
            onClick={() => setView("account")}
          >
            <User className="tv-settings__tile-icon" aria-hidden />
            <span className="tv-settings__tile-label">Account</span>
            <span className="tv-settings__tile-hint">Provider connection info</span>
          </button>
          <button
            type="button"
            data-tv-card-root
            className="tv-settings__tile focus-ring"
            onClick={() => setView("parental")}
          >
            <ShieldCheck className="tv-settings__tile-icon" aria-hidden />
            <span className="tv-settings__tile-label">Parental</span>
            <span className="tv-settings__tile-hint">Hide adult content</span>
          </button>
          <button
            type="button"
            data-tv-card-root
            className="tv-settings__tile tv-settings__tile--danger focus-ring"
            onClick={async () => {
              clearRecents();
              await signOutFully();
              router.replace("/login");
            }}
          >
            <LogOut className="tv-settings__tile-icon" aria-hidden />
            <span className="tv-settings__tile-label">Sign out</span>
            <span className="tv-settings__tile-hint">Leave this TV</span>
          </button>
        </nav>
      </TvFocusRoot>
    );
  }

  const backToMenu = (
    <button
      type="button"
      data-tv-card-root
      className="tv-simple-browse__back focus-ring"
      onClick={() => {
        setView("menu");
        setError(null);
        setConfirmDeleteId(null);
        setRenamingId(null);
      }}
    >
      <ArrowLeft className="size-5 shrink-0" aria-hidden />
      <span>Settings menu</span>
    </button>
  );

  if (view === "account") {
    return (
      <TvFocusRoot className="tv-settings" autoFocus>
        {backToMenu}
        <div className="tv-settings__panel">
          <h2 className="tv-settings__panel-title">Account</h2>
          <dl className="tv-settings__facts">
            <div>
              <dt>Server</dt>
              <dd>{creds?.server || "—"}</dd>
            </div>
            <div>
              <dt>Username</dt>
              <dd>{creds?.username || "—"}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{account?.user_info.status || "—"}</dd>
            </div>
            <div>
              <dt>Expires</dt>
              <dd>
                {account?.user_info.exp_date
                  ? formatDate(account.user_info.exp_date)
                  : "Unknown"}
              </dd>
            </div>
          </dl>
          <p className="tv-settings__hint">
            To change provider details, open Playlists and add or switch a saved
            playlist. You can also link this TV with a PIN from your phone.
          </p>
        </div>
      </TvFocusRoot>
    );
  }

  if (view === "parental") {
    return (
      <TvFocusRoot className="tv-settings" autoFocus>
        {backToMenu}
        <div className="tv-settings__panel">
          <h2 className="tv-settings__panel-title">Parental controls</h2>
          <button
            type="button"
            data-tv-card-root
            role="switch"
            aria-checked={hideAdult}
            className="tv-settings__toggle focus-ring"
            onClick={() => setHideAdult(!hideAdult)}
          >
            <span className="tv-settings__toggle-label">Hide adult content</span>
            <span
              className={
                hideAdult
                  ? "tv-settings__toggle-pill tv-settings__toggle-pill--on"
                  : "tv-settings__toggle-pill"
              }
            >
              {hideAdult ? "On" : "Off"}
            </span>
          </button>
        </div>
      </TvFocusRoot>
    );
  }

  if (view === "add-playlist") {
    return (
      <TvFocusRoot className="tv-settings" autoFocus>
        {backToMenu}
        <form className="tv-settings__panel" onSubmit={(e) => void submitAddPlaylist(e)}>
          <h2 className="tv-settings__panel-title">Add playlist</h2>
          {addError ? (
            <p className="tv-settings__error">{addError}</p>
          ) : null}
          <label className="tv-settings__field">
            <span>Server URL</span>
            <input
              data-tv-card-root
              value={addServer}
              onChange={(e) => setAddServer(e.target.value)}
              placeholder="http://provider.example:8080"
              className="tv-settings__input focus-ring"
              autoComplete="off"
            />
          </label>
          <label className="tv-settings__field">
            <span>Username</span>
            <input
              data-tv-card-root
              value={addUsername}
              onChange={(e) => setAddUsername(e.target.value)}
              className="tv-settings__input focus-ring"
              autoComplete="username"
            />
          </label>
          <label className="tv-settings__field">
            <span>Password</span>
            <input
              data-tv-card-root
              type="password"
              value={addPassword}
              onChange={(e) => setAddPassword(e.target.value)}
              className="tv-settings__input focus-ring"
              autoComplete="current-password"
            />
          </label>
          <label className="tv-settings__field">
            <span>Name (optional)</span>
            <input
              data-tv-card-root
              value={addLabel}
              onChange={(e) => setAddLabel(e.target.value)}
              className="tv-settings__input focus-ring"
              placeholder="My provider"
            />
          </label>
          <button
            type="submit"
            data-tv-card-root
            disabled={addBusy}
            className="tv-settings__action focus-ring"
          >
            {addBusy ? "Saving…" : "Save & use playlist"}
          </button>
        </form>
      </TvFocusRoot>
    );
  }

  // playlists view
  return (
    <TvFocusRoot className="tv-settings" autoFocus>
      {backToMenu}
      <div className="tv-settings__panel">
        <div className="tv-settings__panel-head">
          <h2 className="tv-settings__panel-title">Playlists</h2>
          {streamSignedIn ? (
            <button
              type="button"
              data-tv-card-root
              className="tv-settings__action tv-settings__action--inline focus-ring"
              onClick={() => {
                if (creds) {
                  setAddServer(creds.server);
                  setAddUsername(creds.username);
                }
                setView("add-playlist");
              }}
            >
              <Plus className="size-5" aria-hidden />
              Add playlist
            </button>
          ) : null}
        </div>

        {error ? <p className="tv-settings__error">{error}</p> : null}

        {loading ? (
          <div className="tv-simple-browse__loading">
            <Loader2 className="size-8 animate-spin text-(--brand)" aria-hidden />
            <p>Loading playlists…</p>
          </div>
        ) : !streamSignedIn ? (
          <p className="tv-settings__hint">
            Sign in with your Streamly account on this TV to save and switch
            playlists. Use Link with PIN on the login screen.
          </p>
        ) : rows.length === 0 ? (
          <p className="tv-settings__hint">
            No saved playlists yet. Add one to switch providers without typing
            credentials each time.
          </p>
        ) : (
          <TvSpatialGrid className="tv-settings__playlist-list">
            {rows.map((row) => {
              const active = activeSavedId === row.id;
              const isRenaming = renamingId === row.id;
              const isConfirmingDelete = confirmDeleteId === row.id;
              return (
                <div key={row.id} className="tv-settings__playlist-card">
                  {isRenaming ? (
                    <div className="tv-settings__rename">
                      <input
                        data-tv-card-root
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="tv-settings__input focus-ring"
                        aria-label="Playlist name"
                      />
                      <button
                        type="button"
                        data-tv-card-root
                        className="tv-settings__action focus-ring"
                        disabled={busyId === row.id}
                        onClick={() => void saveRename(row.id)}
                      >
                        <Check className="size-5" aria-hidden /> Save name
                      </button>
                      <button
                        type="button"
                        data-tv-card-root
                        className="tv-settings__ghost focus-ring"
                        onClick={() => {
                          setRenamingId(null);
                          setRenameValue("");
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : isConfirmingDelete ? (
                    <div className="tv-settings__confirm">
                      <p>Remove &ldquo;{row.label}&rdquo;?</p>
                      <button
                        type="button"
                        data-tv-card-root
                        className="tv-settings__action tv-settings__action--danger focus-ring"
                        disabled={busyId === row.id}
                        onClick={() => void deletePlaylist(row.id)}
                      >
                        Yes, remove
                      </button>
                      <button
                        type="button"
                        data-tv-card-root
                        className="tv-settings__ghost focus-ring"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="tv-settings__playlist-meta">
                        <span className="tv-settings__playlist-name">
                          {row.label}
                          {active ? (
                            <span className="tv-settings__active-badge">Active</span>
                          ) : null}
                        </span>
                        <span className="tv-settings__playlist-sub">
                          Saved on this account
                        </span>
                      </div>
                      <div className="tv-settings__playlist-actions">
                        {!active ? (
                          <button
                            type="button"
                            data-tv-card-root
                            className="tv-settings__action focus-ring"
                            disabled={busyId === row.id}
                            onClick={() => void activatePlaylist(row.id)}
                          >
                            {busyId === row.id ? "Switching…" : "Use this playlist"}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          data-tv-card-root
                          className="tv-settings__ghost focus-ring"
                          onClick={() => {
                            setRenamingId(row.id);
                            setRenameValue(row.label);
                          }}
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          data-tv-card-root
                          className="tv-settings__ghost tv-settings__ghost--danger focus-ring"
                          onClick={() => setConfirmDeleteId(row.id)}
                        >
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </TvSpatialGrid>
        )}
      </div>
    </TvFocusRoot>
  );
}
