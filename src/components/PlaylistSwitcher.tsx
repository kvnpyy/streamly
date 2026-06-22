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
  useLayoutEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  useState,
} from "react";
import { createPortal } from "react-dom";

function subscribeNoop() {
  return () => {};
}

export const PLAYLIST_SETTINGS_HREF = "/app/settings?add=playlist#playlists";

type MenuPos = { top: number; left: number; width: number };

/**
 * Saved IPTV provider accounts (requires Streamly sign-in); switches cookie + auth store + React Query caches.
 */
export function PlaylistSwitcher({
  className,
  compact = false,
  tvNav = false,
}: {
  className?: string;
  /** Icon-only trigger for narrow top bars (phones). */
  compact?: boolean;
  /** Living-room top bar — labeled control sized for remotes. */
  tvNav?: boolean;
}) {
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
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const portalReady = useSyncExternalStore(subscribeNoop, () => true, () => false);

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const update = () => {
      const r = trigger.getBoundingClientRect();
      const width = Math.min(
        Math.max(r.width, 240),
        Math.min(window.innerWidth * 0.92, 352)
      );
      let left = r.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setMenuPos({ top: r.bottom + 6, left, width });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open]);

  // Refetch when onboarding flow saves a new account (cross-component broadcast).
  useEffect(() => {
    function onSaved() {
      void refetch();
    }
    window.addEventListener("provider-account-saved", onSaved);
    return () => window.removeEventListener("provider-account-saved", onSaved);
  }, [refetch]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let removeListener: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      function onPointerDown(ev: MouseEvent | PointerEvent) {
        const t = ev.target as Node;
        if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
        setOpen(false);
      }
      window.addEventListener("pointerdown", onPointerDown, true);
      removeListener = () =>
        window.removeEventListener("pointerdown", onPointerDown, true);
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      removeListener?.();
    };
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

  if (status !== "authenticated") {
    if (tvNav) {
      return (
        <Link
          href={PLAYLIST_SETTINGS_HREF}
          data-tv-card-root
          title="Playlists"
          className={cn(
            "tv-top-nav__tool flex items-center gap-1.5 min-h-11 px-3 py-2 rounded-xl text-sm font-medium text-(--text-dim) hover:text-(--text) hover:bg-(--bg-2)/60 transition-colors",
            className
          )}
        >
          <ListMusic className="size-4 shrink-0 text-(--brand-2)" aria-hidden />
          <span>Playlists</span>
        </Link>
      );
    }
    return null;
  }

  const menu =
    open && menuPos && portalReady
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-label="Saved playlists"
            className="fixed z-[120] rounded-xl border border-(--line) bg-(--bg-1) shadow-[0_20px_50px_rgba(0,0,0,0.45)] overflow-hidden touch-manipulation"
            style={{
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: "min(70dvh, 420px)",
              overflowY: "auto",
            }}
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
                        "w-full text-left px-3 py-3 text-xs transition-colors flex items-center gap-2.5 touch-manipulation min-h-11",
                        sel
                          ? "bg-(--brand)/14 text-(--text)"
                          : "hover:bg-(--bg-2) active:bg-(--bg-2) text-(--text-dim)"
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
                href={PLAYLIST_SETTINGS_HREF}
                onClick={() => setOpen(false)}
                className="flex-1 flex items-center gap-2 px-2.5 py-2.5 rounded-lg hover:bg-(--bg-2) active:bg-(--bg-2) text-xs text-(--text-muted) hover:text-(--text) transition-colors min-h-11 touch-manipulation"
              >
                <Plus className="size-3.5 text-(--brand)" />
                Add playlist
              </Link>
              <Link
                href="/app/settings#playlists"
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 px-2.5 py-2.5 rounded-lg hover:bg-(--bg-2) active:bg-(--bg-2) text-xs text-(--text-muted) hover:text-(--text) transition-colors min-h-11 touch-manipulation"
              >
                <Settings2 className="size-3.5" />
                Manage
              </Link>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-haspopup="listbox"
        disabled={busyId !== null}
        onClick={() => {
          if (loadingList) void refetch();
          setOpen((o) => !o);
        }}
        onKeyDown={(e: KeyboardEvent<HTMLButtonElement>) => {
          if (e.key === "Escape") setOpen(false);
        }}
        title="Switch playlist"
        aria-label={
          compact && !tvNav ? `Switch playlist (${summaryLabel})` : undefined
        }
        className={cn(
          "rounded-xl border border-(--line) bg-(--bg-2) text-(--text-dim) hover:border-(--brand)/40 hover:text-(--text) transition-colors disabled:opacity-55 touch-manipulation",
          tvNav
            ? "flex items-center gap-1.5 min-h-11 px-3 py-2 text-sm font-medium max-w-[11rem] border-transparent bg-transparent hover:bg-(--bg-2)/60"
            : compact
              ? "inline-flex size-9 items-center justify-center"
              : "flex items-center gap-1.5 min-h-9 max-w-[10.5rem] sm:max-w-[14rem] pl-2.5 pr-2 text-[11px] sm:text-xs"
        )}
      >
        <ListMusic
          className={cn(
            "shrink-0 text-(--brand-2)",
            tvNav ? "size-4" : "size-3.5"
          )}
          aria-hidden
        />
        {(tvNav || !compact) && (
          <>
            <span className="truncate min-w-0 font-medium">
              {tvNav && !activeRow ? "Playlists" : summaryLabel}
            </span>
            {busyId !== null ? (
              <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
            ) : (
              <ChevronDown
                className={cn(
                  "size-3.5 shrink-0 opacity-80 transition-transform",
                  open && "rotate-180"
                )}
                aria-hidden
              />
            )}
          </>
        )}
        {compact && !tvNav && busyId !== null ? (
          <Loader2 className="size-3.5 animate-spin shrink-0" aria-hidden />
        ) : null}
      </button>
      {menu}
    </div>
  );
}
