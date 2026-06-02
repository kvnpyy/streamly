"use client";

import { useDebouncedValue } from "@/lib/use-debounce";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const LIVE_PAGE_PATH = "/app/live";

/**
 * URL-backed live search (`/app/live?q=…`), shared between the Live page and TopBar.
 */
export function useLivePageSearch() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const onLive = pathname === LIVE_PAGE_PATH;
  const urlQ = onLive ? (sp.get("q") ?? "") : "";

  const [inputValue, setInputValue] = useState(urlQ);
  const debounced = useDebouncedValue(inputValue, 300);
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

  useEffect(() => {
    if (!onLive) return;
    const trimmed = debounced.trim();
    if (trimmed === committedRef.current.trim()) return;
    committedRef.current = debounced;
    const params = new URLSearchParams(sp.toString());
    if (trimmed) params.set("q", trimmed);
    else params.delete("q");
    const qs = params.toString();
    router.replace(qs ? `${LIVE_PAGE_PATH}?${qs}` : LIVE_PAGE_PATH, {
      scroll: false,
    });
  }, [debounced, onLive, sp, router]);

  const setInputValueStable = useCallback((v: string) => {
    setInputValue(v);
  }, []);

  const clear = useCallback(() => {
    setInputValue("");
    committedRef.current = "";
  }, []);

  const qTrim = useMemo(() => inputValue.trim(), [inputValue]);
  const qLower = useMemo(() => qTrim.toLowerCase(), [qTrim]);

  return {
    onLive,
    inputValue,
    setInputValue: setInputValueStable,
    clear,
    qTrim,
    qLower,
    hasQuery: Boolean(qTrim),
  };
}
