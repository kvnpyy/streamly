"use client";

import { useDebouncedValue } from "@/lib/use-debounce";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * TV browsers use {@link TvTopNav} instead of {@link TopBar}, so the global
 * search field in the sticky header does not exist. This panel is the primary
 * search UI on `/app/search` for remote / on-screen keyboard entry.
 */
export function TvSearchPanel({ className }: { className?: string }) {
  const tv = useTvBrowser();
  const router = useRouter();
  const sp = useSearchParams();
  const urlQ = sp.get("q") ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const debounced = useDebouncedValue(draft ?? "", 300);

  const value = draft ?? urlQ;

  useEffect(() => {
    if (draft === null) return;
    const trimmed = debounced.trim();
    if (trimmed === urlQ.trim()) return;
    const params = new URLSearchParams(sp.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `/app/search?${qs}` : "/app/search", { scroll: false });
  }, [debounced, draft, urlQ, sp, router]);

  useEffect(() => {
    if (!tv) return;
    const t = window.setTimeout(() => {
      const el = inputRef.current;
      if (!el) return;
      try {
        el.focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    }, 280);
    return () => window.clearTimeout(t);
  }, [tv]);

  const commitSearch = () => {
    const trimmed = value.trim();
    const params = new URLSearchParams(sp.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `/app/search?${qs}` : "/app/search", { scroll: false });
  };

  return (
    <form
      className={cn("w-full", className)}
      onSubmit={(e) => {
        e.preventDefault();
        commitSearch();
      }}
    >
      <label
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border border-(--line) bg-(--bg-2)/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]",
          "focus-within:border-(--brand)/50 focus-within:ring-2 focus-within:ring-(--brand)/25",
          tv ? "min-h-[3.75rem] px-4 py-3" : "min-h-[2.75rem] px-3 py-2"
        )}
        onPointerDown={(e) => {
          if (e.target === inputRef.current) return;
          e.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <Search
          className={cn(
            "shrink-0 text-(--text-muted)",
            tv ? "size-6" : "size-4"
          )}
          aria-hidden
        />
        <input
          ref={inputRef}
          id="tv-search-page-input"
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onInput={(e) => setDraft(e.currentTarget.value)}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a channel, movie, or series…"
          className={cn(
            "min-w-0 flex-1 bg-transparent text-(--text) outline-none placeholder:text-(--text-muted)",
            tv ? "text-lg sm:text-xl" : "text-sm"
          )}
          onKeyDown={(e) => e.stopPropagation()}
        />
        <button
          type="submit"
          className={cn(
            "shrink-0 rounded-xl btn-brand font-semibold text-white",
            tv ? "min-h-[2.75rem] px-5 text-base" : "min-h-9 px-4 text-sm"
          )}
        >
          Search
        </button>
      </label>
      {tv && !value.trim() && (
        <p className="mt-3 text-sm text-(--text-muted) text-center leading-relaxed">
          Select the box above, then use your TV remote to type. Results appear
          below as you search.
        </p>
      )}
    </form>
  );
}
