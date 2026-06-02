"use client";

import { invalidateBrowseCatalogs } from "@/lib/catalog-queries";
import {
  activateSavedProviderAccount,
  fetchSavedProviderAccounts,
} from "@/lib/provider-account-client";
import { cn } from "@/lib/utils";
import { useAuth, writeAuthSessionBridge } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, ListMusic, Loader2, Plus, Settings2 } from "lucide-react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

/**
 * Saved IPTV provider accounts (requires Streamly sign-in); switches cookie + auth store + React Query caches.
 */
export function PlaylistSwitcher({ className }: { className?: string }) {
  const { status } = useSession();
  const qc = useQueryClient();
  const creds = useAuth((s) => s.creds);
  const setCreds = useAuth((s) => s.setCreds);
  const setAccount = useAuth((s) => s.setAccount);
  const activeSavedId = usePrefs((s) => s.activeSavedProviderAccountId);
  const setActiveSavedId = usePrefs((s) => s.setActiveSavedProviderAccountId);

  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const {
    data: rows = [],
    isPending: loadingList,
    error: fetchError,
    refetch,
  } = useQuery({
    queryKey: ["saved-provider-accounts"],
    queryFn: fetchSavedProviderAccounts,
    enabled: status === "authenticated",
  });

  const rootRef = useRef<HTMLDivElement>(null);

  // Refetch when onboarding flow saves a new account (cross-component broadcast).
  useEffect(() => {
    function onSaved() {
      void refetch();
    }
    window.addEventListener("provider-account-saved", onSaved);
    return () => window.removeEventListener("provider-account-saved", onSaved);
  }, [refetch]);

  useEffect(() => {
    function onPointerDown(ev: MouseEvent | PointerEvent) {
      const root = rootRef.current;
      if (!open || !root) return;
      const t = ev.target as Node;
      if (!root.contains(t)) setOpen(false);
    }
    if (!open) return;
    window.addEventListener("pointerdown", onPointerDown, true);
    return () => window.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const activeRow = useMemo(
    () => rows.find((r) => r.id === activeSavedId),
    [rows, activeSavedId]
  );

  const summaryLabel = useMemo(() => {
    if (activeRow) return activeRow.label;
    if (creds) return `${creds.username}`;
    return "Playlists";
  }, [activeRow, creds]);

  const loadErrorMsg =
    fetchError instanceof Error ? fetchError.message : fetchError ? String(fetchError) : null;
  const listErrorMsg = switchError ?? loadErrorMsg;

  const onPick = useCallback(
    async (id: string) => {
      if (busyId !== null) return;
      setBusyId(id);
      setSwitchError(null);
      try {
        const { creds: nextCreds, account } = await activateSavedProviderAccount(id);
        setCreds(nextCreds);
        if (account) setAccount(account);
        const merged = account ?? useAuth.getState().account;
        if (merged) writeAuthSessionBridge(nextCreds, merged);
        setActiveSavedId(id);
        await invalidateBrowseCatalogs(qc, nextCreds);
        await refetch();
        setOpen(false);
      } catch (e) {
        setSwitchError(e instanceof Error ? e.message : "Switch failed.");
      } finally {
        setBusyId(null);
      }
    },
    [busyId, setCreds, setAccount, setActiveSavedId, qc, refetch]
  );

  if (status !== "authenticated") return null;

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={busyId !== null || loadingList}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
          if (e.key === "Escape") setOpen(false);
        }}
        title="Switch playlist"
        className="flex items-center gap-1.5 min-h-9 max-w-[10.5rem] sm:max-w-[14rem] pl-2.5 pr-2 rounded-xl border border-(--line) bg-(--bg-2) text-[11px] sm:text-xs text-(--text-dim) hover:border-(--brand)/40 hover:text-(--text) transition-colors disabled:opacity-55"
      >
        <ListMusic className="size-3.5 shrink-0 text-(--brand-2)" aria-hidden />
        <span className="truncate min-w-0 font-medium">{summaryLabel}</span>
        {busyId !== null ? (
          <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
        ) : (
          <ChevronDown
            className={cn("size-3.5 shrink-0 opacity-80 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Saved playlists"
          className="absolute right-0 z-50 mt-1.5 min-w-[15rem] max-w-[min(90vw,22rem)] rounded-xl border border-(--line) bg-(--bg-1) shadow-[0_20px_50px_rgba(0,0,0,0.45)] overflow-hidden"
        >
          {listErrorMsg && (
            <div className="px-3 py-2 text-[11px] text-(--danger) border-b border-(--danger)/25">
              {listErrorMsg}
            </div>
          )}

          {loadingList ? (
            <div className="flex items-center gap-2 px-3 py-3 text-xs text-(--text-muted)">
              <Loader2 className="size-3.5 animate-spin" aria-hidden /> Loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-3 py-3 text-xs text-(--text-muted) text-center">
              No saved playlists yet.
            </div>
          ) : (
            <div className="py-1">
              {rows.map((row) => {
                const sel = activeSavedId === row.id;
                const isBusy = busyId === row.id;
                return (
                  <button
                    key={row.id}
                    type="button"
                    role="option"
                    aria-selected={sel}
                    disabled={busyId !== null}
                    onClick={() => void onPick(row.id)}
                    className={cn(
                      "w-full text-left px-3 py-2.5 text-xs transition-colors flex items-center gap-2.5",
                      sel
                        ? "bg-(--brand)/14 text-(--text)"
                        : "hover:bg-(--bg-2) text-(--text-dim)"
                    )}
                  >
                    <span
                      className={cn(
                        "shrink-0 size-4 rounded-full flex items-center justify-center transition-colors",
                        sel
                          ? "bg-(--brand)"
                          : "border border-(--line-2) bg-(--bg-3)"
                      )}
                    >
                      {sel && !isBusy && <Check className="size-2.5 text-white" />}
                      {isBusy && <Loader2 className="size-2.5 animate-spin text-white" />}
                    </span>
                    <span className="font-medium truncate flex-1">{row.label}</span>
                    {sel && (
                      <span className="text-[10px] text-(--brand) font-semibold shrink-0">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <div className="border-t border-(--line) flex items-center gap-0.5 px-1 py-1">
            <Link
              href="/app/settings#playlists"
              onClick={() => setOpen(false)}
              className="flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-(--bg-2) text-xs text-(--text-muted) hover:text-(--text) transition-colors"
            >
              <Plus className="size-3.5 text-(--brand)" />
              Add playlist
            </Link>
            <Link
              href="/app/settings#playlists"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg hover:bg-(--bg-2) text-xs text-(--text-muted) hover:text-(--text) transition-colors"
            >
              <Settings2 className="size-3.5" />
              Manage
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
