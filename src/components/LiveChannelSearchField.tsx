"use client";

import { useTvBrowser } from "@/components/TvBrowserProvider";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { forwardRef, useCallback } from "react";

type LiveChannelSearchFieldProps = {
  value: string;
  onValueChange: (value: string) => void;
  onClear?: () => void;
  className?: string;
  id?: string;
};

/**
 * Live TV search — tuned for TV browsers (Samsung 125% zoom, on-screen keyboards).
 * Uses onInput + onChange; label tap focuses the field for remotes.
 */
export const LiveChannelSearchField = forwardRef<
  HTMLInputElement,
  LiveChannelSearchFieldProps
>(function LiveChannelSearchField(
  { value, onValueChange, onClear, className, id = "live-channel-search" },
  ref
) {
  const tv = useTvBrowser();

  const commit = useCallback(
    (next: string) => {
      onValueChange(next);
    },
    [onValueChange]
  );

  return (
    <div
      className={cn(
        "live-channel-search flex items-center gap-2 rounded-xl bg-(--bg-2) border border-(--line)",
        "focus-within:border-(--brand)/50 focus-within:ring-2 focus-within:ring-(--brand)/20",
        tv ? "min-h-12 px-4 py-2 w-full min-w-[14rem]" : "h-10 px-3 w-full sm:w-72 min-w-0",
        className
      )}
    >
      <Search
        className={cn("text-(--text-muted) shrink-0", tv ? "size-5" : "size-4")}
        aria-hidden
      />
      <label className="flex flex-1 min-w-0 items-center gap-2 cursor-text">
        <span className="sr-only">Search channels or programs</span>
        <input
          ref={ref}
          id={id}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onInput={(e) => commit(e.currentTarget.value)}
          onChange={(e) => commit(e.target.value)}
          placeholder="Search channels or programs…"
          aria-label="Search channels or programs"
          className={cn(
            "live-channel-search__input min-w-0 flex-1 bg-transparent text-(--text) outline-none",
            "placeholder:text-(--text-muted) caret-(--brand-2)",
            tv ? "text-base sm:text-lg" : "text-sm"
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        />
      </label>
      {value.length > 0 && onClear && (
        <button
          type="button"
          onClick={onClear}
          className={cn(
            "shrink-0 rounded-lg text-(--text-muted) hover:text-(--text) hover:bg-(--bg-3) transition-colors",
            tv ? "min-h-10 px-3 text-sm font-medium" : "text-[11px] px-2 py-1"
          )}
        >
          Clear
        </button>
      )}
    </div>
  );
});
