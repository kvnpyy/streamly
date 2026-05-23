"use client";

import { PlaylistSwitcher } from "@/components/PlaylistSwitcher";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { isAmazonSilkUserAgent } from "@/lib/tv-user-agent";
import { cn } from "@/lib/utils";
import { SITE_NAME } from "@/lib/site-brand";
import { useDebouncedValue } from "@/lib/use-debounce";
import { Search, Sparkles } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Suspense,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

function subscribeNoop() {
  return () => {};
}

function getSilkClientSnapshot() {
  return (
    typeof navigator !== "undefined" &&
    isAmazonSilkUserAgent(navigator.userAgent)
  );
}

function getSilkServerSnapshot() {
  return false;
}

function TopBarSearchSkeleton() {
  return (
    <div className="sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
      <div className="glass border-b border-(--line) h-[3.25rem] sm:h-14 animate-pulse bg-(--bg-2)/40" />
    </div>
  );
}

function TopBarInner({ title, subtitle }: { title?: string; subtitle?: string }) {
  const tv = useTvBrowser();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  /** Draft text when not on `/app/search` (URL owns the field on the search page). */
  const [offRouteQuery, setOffRouteQuery] = useState("");
  const silkUa = useSyncExternalStore(
    subscribeNoop,
    getSilkClientSnapshot,
    getSilkServerSnapshot
  );
  const ref = useRef<HTMLInputElement>(null);

  const showSearchSubmit = tv || silkUa;
  const onSearchPage = pathname === "/app/search";
  const urlQ = sp.get("q") ?? "";

  /**
   * Local draft state for the search input when on /app/search.
   * - null  → user hasn't typed yet; input falls back to urlQ from the URL.
   * - string → user typed; shown instantly, URL updated after 300 ms debounce.
   *
   * No effects needed to initialise/reset: `searchDraft ?? urlQ` naturally
   * shows the URL value until the user starts typing, and the non-search-page
   * branch uses offRouteQuery so the draft is invisible when not on /app/search.
   */
  const [searchDraft, setSearchDraft] = useState<string | null>(null);
  const debouncedDraft = useDebouncedValue(searchDraft ?? "", 300);

  // Push debounced draft to the URL (only when the user has typed something).
  // Guard `trimmed === urlQ.trim()` breaks the potential re-run loop after
  // router.replace updates sp, which re-runs this effect with the new urlQ.
  useEffect(() => {
    if (searchDraft === null || !onSearchPage) return;
    const trimmed = debouncedDraft.trim();
    if (trimmed === urlQ.trim()) return;
    const params = new URLSearchParams(sp.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `/app/search?${qs}` : "/app/search", { scroll: false });
  }, [debouncedDraft, searchDraft, onSearchPage, urlQ, sp, router]);

  // Ctrl/Cmd+K focuses the search input.
  const inputValue = onSearchPage ? (searchDraft ?? urlQ) : offRouteQuery;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="sticky top-0 z-30 pt-[env(safe-area-inset-top,0px)]">
      <div
        className={cn(
          "glass border-b border-(--line) flex items-center gap-2 sm:gap-4",
          tv ? "px-4 py-2" : "px-3 sm:px-6 py-2.5 sm:py-3"
        )}
      >
        {(title || subtitle) && (
          <div className="hidden md:block min-w-0">
            {title && (
              <div className="text-base font-semibold tracking-tight truncate">
                {title}
              </div>
            )}
            {subtitle && (
              <div className="text-xs text-(--text-muted) truncate">{subtitle}</div>
            )}
          </div>
        )}

        <PlaylistSwitcher className="hidden sm:flex shrink-0 mr-1.5 xl:mr-2" />

        <form
          className="flex-1 max-w-2xl mx-auto flex items-stretch gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const v = inputValue.trim();
            if (!v) return;
            router.push(`/app/search?q=${encodeURIComponent(v)}`);
          }}
        >
          <label className="flex flex-1 min-w-0 items-center gap-2 h-10 px-3 rounded-xl bg-(--bg-2) border border-(--line) shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-(--brand)/45 focus-within:bg-(--bg-2)/90 focus-within:ring-2 focus-within:ring-(--brand)/22 focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_0_0_1px_rgba(124,92,255,0.15)]">
            <Search className="size-4 text-(--text-muted) shrink-0" />
            <input
              ref={ref}
              id="global-search-input"
              value={inputValue}
              onChange={(e) => {
                const v = e.target.value;
                if (onSearchPage) {
                  // Update draft instantly (no lag, spacebar works correctly).
                  // The debounced effect above pushes to the URL after 300 ms.
                  setSearchDraft(v);
                } else {
                  setOffRouteQuery(v);
                }
              }}
              placeholder="Search channels, movies, series…"
              className="bg-transparent outline-none text-sm w-full min-w-0 placeholder:text-(--text-muted)"
            />
            {!tv && (
              <kbd className="hidden sm:inline shrink-0 text-[10px] text-(--text-muted) border border-(--line-2) rounded px-1.5 py-0.5">
                ⌘K
              </kbd>
            )}
          </label>
          {showSearchSubmit && (
            <button
              type="submit"
              className="shrink-0 h-10 px-3 sm:px-4 rounded-xl btn-brand text-sm font-medium min-w-[4.5rem]"
            >
              Search
            </button>
          )}
        </form>

        <div
          className={cn(
            "hidden lg:flex items-center gap-2 text-[11px] text-(--text-muted)",
            tv && "lg:hidden"
          )}
        >
          <Sparkles className="size-3.5 text-(--brand-2)" />
          <span className="hidden sm:inline">{SITE_NAME} — smooth playback</span>
        </div>
      </div>
    </div>
  );
}

export function TopBar({ title, subtitle }: { title?: string; subtitle?: string }) {
  return (
    <Suspense fallback={<TopBarSearchSkeleton />}>
      <TopBarInner title={title} subtitle={subtitle} />
    </Suspense>
  );
}
