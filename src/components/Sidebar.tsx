"use client";

import { APP_NAV } from "@/lib/nav-config";
import { BrandMark } from "@/components/BrandMark";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { feedbackFormUrlWithContext } from "@/lib/feedback-url";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth";
import { usePrefs } from "@/store/preferences";
import { LogOut, MessageSquare, PanelLeftClose, PanelLeftOpen, Settings, Star } from "lucide-react";
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
        {/* GitHub star CTA — changes open-source visibility */}
        <a
          href="https://github.com/kvnpyy/streamly"
          target="_blank"
          rel="noopener noreferrer"
          title={collapsed ? "Star on GitHub" : undefined}
          aria-label="Star Streamly on GitHub"
          className={cn(
            "flex w-full items-center rounded-xl text-sm transition-colors",
            collapsed
              ? "justify-center px-2 py-2.5 text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
              : "gap-3 px-3 py-2.5 text-amber-300/90 hover:text-amber-300 hover:bg-amber-300/8"
          )}
        >
          {/* GitHub mark SVG */}
          <svg
            viewBox="0 0 16 16"
            className="size-[18px] shrink-0 fill-current"
            aria-hidden
          >
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          {!collapsed && (
            <span className="flex items-center gap-1.5">
              <Star className="size-3 fill-amber-300 text-amber-300" />
              Star on GitHub
            </span>
          )}
        </a>
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
