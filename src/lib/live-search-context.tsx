"use client";

import { useDebouncedValue } from "@/lib/use-debounce";
import { LIVE_PAGE_PATH } from "@/lib/use-live-page-search";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

type LiveSearchContextValue = {
  inputValue: string;
  setInputValue: (v: string) => void;
  clear: () => void;
  qTrim: string;
  qLower: string;
  deferredQLower: string;
  hasQuery: boolean;
};

const LiveSearchContext = createContext<LiveSearchContextValue | null>(null);

/**
 * Isolates live search typing from the rest of the Live page so keystrokes do
 * not re-render category queries, discovery, etc.
 */
export function LiveSearchProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const onLive = pathname === LIVE_PAGE_PATH;
  const urlQ = onLive ? (sp.get("q") ?? "") : "";

  const [inputValue, setInputValue] = useState(urlQ);
  const debounced = useDebouncedValue(inputValue, 400);
  const committedRef = useRef(urlQ);

  useEffect(() => {
    if (!onLive) {
      queueMicrotask(() => {
        setInputValue("");
        committedRef.current = "";
      });
      return;
    }
    if (urlQ !== committedRef.current) {
      queueMicrotask(() => {
        setInputValue(urlQ);
        committedRef.current = urlQ;
      });
    }
  }, [onLive, urlQ]);

  /** Sync URL without Next.js navigation (avoids full-tree re-renders while typing). */
  useEffect(() => {
    if (!onLive || typeof window === "undefined") return;
    const trimmed = debounced.trim();
    if (trimmed === committedRef.current.trim()) return;
    committedRef.current = debounced;
    const qs = trimmed
      ? `?q=${encodeURIComponent(trimmed)}`
      : "";
    const next = `${LIVE_PAGE_PATH}${qs}`;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(window.history.state, "", next);
    }
  }, [debounced, onLive]);

  const setInputValueStable = useCallback((v: string) => {
    setInputValue(v);
  }, []);

  const clear = useCallback(() => {
    setInputValue("");
    committedRef.current = "";
    if (typeof window !== "undefined") {
      window.history.replaceState(window.history.state, "", LIVE_PAGE_PATH);
    }
  }, []);

  const qTrim = useMemo(() => inputValue.trim(), [inputValue]);
  const qLower = useMemo(() => qTrim.toLowerCase(), [qTrim]);
  const deferredQLower = useDebouncedValue(qLower, 120);

  const value = useMemo(
    () => ({
      inputValue,
      setInputValue: setInputValueStable,
      clear,
      qTrim,
      qLower,
      deferredQLower,
      hasQuery: Boolean(qTrim),
    }),
    [
      inputValue,
      setInputValueStable,
      clear,
      qTrim,
      qLower,
      deferredQLower,
    ]
  );

  return (
    <LiveSearchContext.Provider value={value}>
      {children}
    </LiveSearchContext.Provider>
  );
}

export function useLiveSearchContext(): LiveSearchContextValue {
  const ctx = useContext(LiveSearchContext);
  if (!ctx) {
    throw new Error("useLiveSearchContext must be used within LiveSearchProvider");
  }
  return ctx;
}

export function useLiveSearchContextOptional(): LiveSearchContextValue | null {
  return useContext(LiveSearchContext);
}
