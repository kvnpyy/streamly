"use client";

import {
  ALL_VOD_LANGUAGE_CODES,
  vodLanguageLabel,
} from "@/lib/vod-language";
import { cn } from "@/lib/utils";
import { Check, Languages, Search, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  value: string | "all";
  onChange: (code: string | "all") => void;
  detected?: string[];
};

export function VodLanguageBrowseModal({
  open,
  onClose,
  value,
  onChange,
  detected = [],
}: Props) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) queueMicrotask(() => setQuery(""));
  }, [open]);

  const detectedSet = useMemo(() => new Set(detected), [detected]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [...ALL_VOD_LANGUAGE_CODES];
    return ALL_VOD_LANGUAGE_CODES.filter((code) => {
      const label = vodLanguageLabel(code).toLowerCase();
      return (
        code.toLowerCase().includes(needle) ||
        label.includes(needle)
      );
    });
  }, [query]);

  if (!open) return null;

  const pick = (code: string | "all") => {
    onChange(code);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Browse languages"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/72 backdrop-blur-[2px]"
        aria-label="Close language browser"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg sm:max-w-xl flex flex-col max-h-[min(88dvh,720px)] rounded-t-2xl sm:rounded-2xl border border-(--line) bg-(--bg-1) shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-(--line) bg-(--bg-2) shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Languages className="size-4 text-(--brand-2) shrink-0" aria-hidden />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-(--text)">
                Browse languages
              </div>
              <div className="text-[11px] text-(--text-muted)">
                Filter by title prefix — EN, FR, NL, and more
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 inline-flex size-10 items-center justify-center rounded-xl border border-(--line) bg-(--bg-3) text-(--text) hover:border-(--brand)/40"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-(--line) shrink-0">
          <label className="relative block">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-(--text-muted)"
              aria-hidden
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search languages…"
              autoFocus
              className="w-full h-11 pl-10 pr-3 rounded-xl bg-(--bg-2) border border-(--line) text-sm outline-none focus:border-(--brand)/50"
            />
          </label>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-2 scrollbar-hide">
          <button
            type="button"
            onClick={() => pick("all")}
            className={cn(
              "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-2 mb-1",
              value === "all"
                ? "bg-(--brand)/12 text-(--text) font-medium"
                : "text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
            )}
          >
            {value === "all" ? (
              <Check className="size-3.5 text-(--brand-2)" aria-hidden />
            ) : (
              <span className="size-3.5" aria-hidden />
            )}
            All languages
          </button>

          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-sm text-center text-(--text-muted)">
              No languages match your search.
            </p>
          ) : (
            filtered.map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => pick(code)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between gap-2",
                  value === code
                    ? "bg-(--brand)/12 text-(--text) font-medium"
                    : "text-(--text-dim) hover:bg-(--bg-2) hover:text-(--text)"
                )}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {value === code ? (
                    <Check className="size-3.5 shrink-0 text-(--brand-2)" aria-hidden />
                  ) : (
                    <span className="size-3.5 shrink-0" aria-hidden />
                  )}
                  <span className="truncate">{vodLanguageLabel(code)}</span>
                  {detectedSet.has(code) ? (
                    <span className="text-[10px] uppercase tracking-wide text-(--brand-2) shrink-0">
                      in catalog
                    </span>
                  ) : null}
                </span>
                <span className="text-[11px] text-(--text-muted) tabular-nums shrink-0">
                  {code}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
