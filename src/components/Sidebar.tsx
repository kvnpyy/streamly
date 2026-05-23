"use client";

import { APP_NAV } from "@/lib/nav-config";
import { BrandMark } from "@/components/BrandMark";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { feedbackFormUrlWithContext } from "@/lib/feedback-url";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { LogOut, MessageSquare, PanelLeftClose, PanelLeftOpen, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const tv = useTvBrowser();
  const tvCollapsedOnce = useRef(false);
  const { account, signOut } = useAuth();
  const collapsed = usePrefs((s) => s.sidebarCollapsed);
  const setCollapsed = usePrefs((s) => s.setSidebarCollapsed);

  /** Icon rail by default on TV so content keeps most of the screen. */
  useEffect(() => {
    if (!tv || tvCollapsedOnce.current) return;
    tvCollapsedOnce.current = true;
    setCollapsed(true);
  }, [tv, setCollapsed]);

  return (
    <aside
      className={cn(
        "shrink-0 flex-col h-screen sticky top-0 border-r border-(--line) bg-(--bg-1)/50 transition-[width,padding] duration-200 ease-out",
        tv ? "flex" : "hidden md:flex",
        collapsed ? "w-[76px] px-2 py-5" : "w-64 px-4 py-5"
      )}
    >
      <div className={cn("flex items-start gap-2", collapsed && "flex-col items-center gap-3")}>
        <Link
          href="/app"
          className={cn(
            "flex items-center gap-2 rounded-xl text-(--text) min-w-0 flex-1",
            collapsed && "justify-center p-1 flex-none"
          )}
          title="Home"
        >
          <BrandMark size={9} />
          {!collapsed && (
            <div className="min-w-0">
              <div className="font-semibold tracking-tight leading-none">{SITE_NAME}</div>
              <div className="text-[11px] text-(--text-muted) mt-1">{SITE_TAGLINE}</div>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "rounded-lg p-2 text-(--text-muted) hover:bg-(--bg-2) hover:text-(--text) transition-colors shrink-0",
            collapsed ? "mx-auto" : "mt-0.5"
          )}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-[18px]" />
          ) : (
            <PanelLeftClose className="size-[18px]" />
          )}
        </button>
      </div>

      <nav className={cn("mt-6 space-y-1", collapsed && "mt-5")} aria-label="Main">
        {APP_NAV.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/app"
              ? pathname === "/app"
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              title={collapsed ? label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex items-center rounded-xl text-sm transition-colors",
                collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
                active
                  ? "bg-(--bg-3) text-(--text) shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ring-1 ring-(--brand)/18 ring-inset"
                  : "text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
              )}
            >
              <Icon
                className={cn(
                  "size-[18px] transition-colors shrink-0",
                  active ? "text-(--brand)" : "text-(--text-muted) group-hover:text-(--text-dim)"
                )}
              />
              {!collapsed && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={cn("mt-auto pt-4 border-t border-(--line) space-y-1", collapsed && "pt-3")}>
        {!collapsed && (
          <>
            <div className="px-3 pt-1 pb-2 text-[11px] uppercase tracking-wider text-(--text-muted)">
              Account
            </div>
            <div className="px-3 pb-3">
              <div className="text-sm text-(--text) truncate">
                {account?.user_info.username || "Signed in"}
              </div>
              <div className="text-[11px] text-(--text-muted) capitalize">
                {account?.user_info.status?.toLowerCase() || "active"} ·{" "}
                {account?.user_info.max_connections
                  ? `${account.user_info.max_connections} conn`
                  : "unlimited"}
              </div>
            </div>
          </>
        )}
        <a
          href={feedbackFormUrlWithContext({
            surface: "sidebar",
            pathname,
            tvBrowser: tv,
          })}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex w-full items-center rounded-xl text-sm text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text) transition-colors",
            collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
          )}
          title={collapsed ? "Feedback" : undefined}
          aria-label="Send feedback (opens in a new tab)"
        >
          <MessageSquare className="size-[18px] shrink-0" />
          {!collapsed && "Feedback"}
        </a>
        <button
          className={cn(
            "flex w-full items-center rounded-xl text-sm text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text) transition-colors",
            collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
          )}
          onClick={() => router.push("/app/settings")}
          title={collapsed ? "Settings" : undefined}
          aria-label="Settings"
        >
          <Settings className="size-[18px] shrink-0" />
          {!collapsed && "Settings"}
        </button>
        <button
          className={cn(
            "flex w-full items-center rounded-xl text-sm text-(--text-dim) hover:bg-(--bg-2) hover:text-(--danger) transition-colors",
            collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5"
          )}
          title={collapsed ? "Sign out" : undefined}
          aria-label="Sign out"
          onClick={() => {
            signOut();
            router.push("/login");
          }}
        >
          <LogOut className="size-[18px] shrink-0" />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </aside>
  );
}
