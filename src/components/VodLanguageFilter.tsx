"use client";

import { VodLanguageBrowseModal } from "@/components/VodLanguageBrowseModal";
import { useTvBrowser } from "@/components/TvBrowserProvider";
import {
  buildVodLanguageFeaturedOptions,
  vodLanguageLabel,
} from "@/lib/vod-language";
import { cn } from "@/lib/utils";
import { Check, ChevronDown, Languages, LayoutGrid } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  /** Languages detected from the full server catalog scan. */
  detectedLanguages?: string[];
  value: string | "all";
  onChange: (code: string | "all") => void;
  className?: string;
};

export function VodLanguageFilter({
  detectedLanguages = [],
  value,
  onChange,
  className,
}: Props) {
  const tvBrowser = useTvBrowser();
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [browseAllOpen, setBrowseAllOpen] = useState(false);

  const featured = useMemo(
    () => buildVodLanguageFeaturedOptions(detectedLanguages),
    [detectedLanguages]
  );

  const detectedSet = useMemo(
    () => new Set(detectedLanguages),
    [detectedLanguages]
  );

  const selectedLabel = useMemo(() => {
    if (value === "all") return "All languages";
    return vodLanguageLabel(value);
  }, [value]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const pick = (code: string | "all") => {
    onChange(code);
    setMenuOpen(false);
  };

  const openPicker = () => {
    if (tvBrowser) {
      setBrowseAllOpen(true);
      return;
    }
    setMenuOpen((o) => !o);
  };

  return (
    <>
      <div ref={rootRef} className={cn("relative", className)}>
        <button
          type="button"
          aria-expanded={menuOpen}
          aria-haspopup="listbox"
          onClick={openPicker}
          className={cn(
            "inline-flex items-center gap-2 min-h-11 px-3.5 sm:px-4 rounded-lg text-sm font-semibold border transition-colors",
            "bg-(--bg-2) border-(--line) text-(--text) hover:border-(--brand)/45 hover:bg-(--bg-3)",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand)/50 focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg-0)",
            tvBrowser && "min-h-12 px-5 text-base",
            value !== "all" &&
              "border-(--brand)/40 bg-(--brand)/10 shadow-[0_0_20px_-10px_rgba(124,92,255,0.55)]"
          )}
        >
          <Languages
            className="size-4 shrink-0 text-(--text-muted)"
            aria-hidden
          />
          <span className="truncate max-w-[min(52vw,12rem)] sm:max-w-[14rem]">
            {selectedLabel}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-(--text-muted) transition-transform",
              menuOpen && "rotate-180"
            )}
            aria-hidden
          />
        </button>

        {menuOpen && !tvBrowser && (
          <div
            role="listbox"
            aria-label="Languages"
            className="absolute left-0 top-[calc(100%+6px)] z-50 w-[min(100vw-1.5rem,18rem)] max-h-[min(60dvh,22rem)] overflow-y-auto rounded-xl border border-(--line) bg-(--bg-1) shadow-2xl py-1.5 scrollbar-hide"
          >
            <LanguageOption
              active={value === "all"}
              label="All languages"
              onPick={() => pick("all")}
            />
            {detectedLanguages.length > 0 && (
              <div
                className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)"
                aria-hidden
              >
                In your catalog
              </div>
            )}
            {detectedLanguages.map((code) => (
              <LanguageOption
                key={`detected-${code}`}
                active={value === code}
                label={vodLanguageLabel(code)}
                code={code}
                onPick={() => pick(code)}
              />
            ))}
            {featured.some((code) => !detectedSet.has(code)) && (
              <div
                className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-(--text-muted)"
                aria-hidden
              >
                Popular
              </div>
            )}
            {featured
              .filter((code) => !detectedSet.has(code))
              .map((code) => (
                <LanguageOption
                  key={`popular-${code}`}
                  active={value === code}
                  label={vodLanguageLabel(code)}
                  code={code}
                  onPick={() => pick(code)}
                />
              ))}
            <div className="my-1.5 border-t border-(--line)" />
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                setBrowseAllOpen(true);
              }}
              className="w-full text-left px-3 py-2.5 text-sm text-(--brand-2) hover:bg-(--bg-2) flex items-center gap-2 font-medium"
            >
              <LayoutGrid className="size-4 shrink-0 opacity-90" aria-hidden />
              Browse all languages…
            </button>
          </div>
        )}
      </div>

      <VodLanguageBrowseModal
        open={browseAllOpen}
        onClose={() => setBrowseAllOpen(false)}
        value={value}
        onChange={onChange}
        detected={detectedLanguages}
      />
    </>
  );
}

function LanguageOption({
  active,
  label,
  code,
  onPick,
}: {
  active: boolean;
  label: string;
  code?: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onPick}
      className={cn(
        "w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 transition-colors",
        active
          ? "bg-(--brand)/12 text-(--text) font-medium"
          : "text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
      )}
    >
      <span className="flex items-center gap-2 min-w-0">
        {active ? (
          <Check className="size-3.5 shrink-0 text-(--brand-2)" aria-hidden />
        ) : (
          <span className="size-3.5 shrink-0" aria-hidden />
        )}
        <span className="truncate">{label}</span>
      </span>
      {code ? (
        <span className="text-[11px] text-(--text-muted) tabular-nums shrink-0">
          {code}
        </span>
      ) : null}
    </button>
  );
}
