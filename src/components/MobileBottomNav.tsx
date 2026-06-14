"use client";

import { CommunityDiscordSidebarLink } from "@/components/CommunityDiscordSidebarLink";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { MOBILE_NAV_MORE, MOBILE_NAV_PRIMARY } from "@/lib/nav-config";
import { feedbackFormUrlWithContext } from "@/lib/feedback-url";
import { cn } from "@/lib/utils";
import { signOutFully } from "@/lib/sign-out-client";
import { LogOut, Menu, MessageSquare, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

const SHEET_DISMISS_PX = 72;

export function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const tv = useTvBrowser();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDragY, setSheetDragY] = useState(0);
  const sheetDragYRef = useRef(0);
  const handleRef = useRef<HTMLDivElement>(null);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setSheetDragY(0);
    sheetDragYRef.current = 0;
  }, []);

  useEffect(() => {
    if (!sheetOpen) return;
    const el = handleRef.current;
    if (!el) return;

    let startY = 0;

    const onStart = (e: TouchEvent) => {
      startY = e.touches[0].clientY;
    };
    const onMove = (e: TouchEvent) => {
      const dy = e.touches[0].clientY - startY;
      if (dy > 0) {
        e.preventDefault();
        sheetDragYRef.current = dy;
        setSheetDragY(dy);
      }
    };
    const onEnd = () => {
      if (sheetDragYRef.current > SHEET_DISMISS_PX) {
        closeSheet();
      } else {
        sheetDragYRef.current = 0;
        setSheetDragY(0);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd);
    el.addEventListener("touchcancel", onEnd);

    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [sheetOpen, closeSheet]);

  return (
    <>
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 glass border-t border-(--line) pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 px-1"
        aria-label="Main navigation"
      >
        <div className="flex items-stretch justify-around gap-0.5 max-w-lg mx-auto">
          {MOBILE_NAV_PRIMARY.map(({ href, label, icon: Icon }) => {
            const active =
              href === "/app"
                ? pathname === "/app"
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 min-w-0 flex-1 min-h-12 py-2 rounded-xl text-[10px] font-medium transition-colors",
                  active
                    ? "text-(--brand) bg-(--brand)/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
                    : "text-(--text-muted) active:bg-(--bg-2)"
                )}
              >
                <Icon className={cn("size-6 shrink-0", active && "stroke-[2.5px]")} />
                <span className="truncate max-w-full px-0.5">{label.replace(" TV", "")}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => {
              sheetDragYRef.current = 0;
              setSheetDragY(0);
              setSheetOpen(true);
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-1 min-w-0 flex-1 min-h-12 py-2 rounded-xl text-[10px] font-medium transition-colors",
              sheetOpen || MOBILE_NAV_MORE.some((x) => pathname.startsWith(x.href))
                ? "text-(--brand) bg-(--brand)/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)]"
                : "text-(--text-muted) active:bg-(--bg-2)"
            )}
            aria-expanded={sheetOpen}
            aria-haspopup="dialog"
          >
            <Menu className="size-6 shrink-0" />
            <span className="truncate">More</span>
          </button>
        </div>
      </nav>

      {sheetOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-label="Close menu"
            onClick={closeSheet}
          />
          <div
            className="absolute bottom-0 inset-x-0 rounded-t-2xl border border-(--line) border-b-0 bg-(--bg-1) shadow-[0_-12px_48px_rgba(0,0,0,0.45)] pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 px-4 max-h-[min(70dvh,420px)] flex flex-col will-change-transform"
            style={{
              transform: sheetDragY ? `translateY(${sheetDragY}px)` : undefined,
              transition:
                sheetDragY === 0 ? "transform 0.2s ease-out" : undefined,
            }}
          >
            <div
              ref={handleRef}
              className="flex flex-col items-center gap-2 pb-2 -mx-4 px-4 shrink-0 touch-none cursor-grab active:cursor-grabbing"
              aria-label="Drag down to close"
            >
              <div className="h-1 w-10 rounded-full bg-(--line-2)" />
              <span className="sr-only">Drag down to close</span>
            </div>
            <div className="text-[11px] uppercase tracking-wider text-(--text-muted) px-1 mb-2">
              Library &amp; tools
            </div>
            <div className="space-y-1 overflow-y-auto flex-1 min-h-0 touch-pan-y">
              {MOBILE_NAV_MORE.map(({ href, label, icon: Icon }) => {
                const active = pathname.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={closeSheet}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-3 text-sm transition-colors",
                      active
                        ? "bg-(--bg-3) text-(--text)"
                        : "text-(--text-dim) active:bg-(--bg-2)"
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-[18px]",
                        active ? "text-(--brand)" : "text-(--text-muted)"
                      )}
                    />
                    {label}
                  </Link>
                );
              })}
              <CommunityDiscordSidebarLink
                className="rounded-xl px-3 py-3 text-sm text-(--text-dim) active:bg-(--bg-2)"
                onNavigate={closeSheet}
              />
              <a
                href={feedbackFormUrlWithContext({
                  surface: "mobile_sheet",
                  pathname,
                  tvBrowser: tv,
                })}
                target="_blank"
                rel="noopener noreferrer"
                onClick={closeSheet}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-(--text-dim) active:bg-(--bg-2)"
              >
                <MessageSquare className="size-[18px] text-(--text-muted)" />
                Feedback
              </a>
              <Link
                href="/app/settings"
                onClick={closeSheet}
                className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-(--text-dim) active:bg-(--bg-2)"
              >
                <Settings className="size-[18px] text-(--text-muted)" />
                Settings
              </Link>
              <button
                type="button"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm text-(--text-dim) active:bg-(--bg-2) text-left"
                onClick={() => {
                  closeSheet();
                  void signOutFully().then(() => router.replace("/login"));
                }}
              >
                <LogOut className="size-[18px] text-(--danger)" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
