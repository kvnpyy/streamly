"use client";

import { useDebouncedValue } from "@/lib/use-debounce";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export const MOVIES_BROWSE_PATH = "/app/movies";
export const SERIES_BROWSE_PATH = "/app/series";

export type CatalogBrowseKind = "movies" | "series";

type CatalogBrowseSearchContextValue = {
  kind: CatalogBrowseKind;
  inputValue: string;
  setInputValue: (v: string) => void;
  clear: () => void;
  /** Debounced filter string for catalog API queries. */
  qFilter: string;
  hasQuery: boolean;
};

const CatalogBrowseSearchContext =
  createContext<CatalogBrowseSearchContextValue | null>(null);

function browseKindFromPath(pathname: string): CatalogBrowseKind | null {
  if (pathname === MOVIES_BROWSE_PATH) return "movies";
  if (pathname === SERIES_BROWSE_PATH) return "series";
  return null;
}

/**
 * Shared search state for Movies / Series browse so TopBar is the only field
 * (avoids a second page-local search bar).
 */
export function CatalogBrowseSearchProvider({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const kind = browseKindFromPath(pathname);
  const [inputValue, setInputValue] = useState("");
  const qFilter = useDebouncedValue(inputValue.trim(), 140);

  useEffect(() => {
    if (!kind) {
      queueMicrotask(() => setInputValue(""));
    }
  }, [kind]);

  const setInputValueStable = useCallback((v: string) => {
    setInputValue(v);
  }, []);

  const clear = useCallback(() => {
    setInputValue("");
  }, []);

  const value = useMemo(() => {
    if (!kind) return null;
    return {
      kind,
      inputValue,
      setInputValue: setInputValueStable,
      clear,
      qFilter,
      hasQuery: Boolean(inputValue.trim()),
    };
  }, [kind, inputValue, setInputValueStable, clear, qFilter]);

  return (
    <CatalogBrowseSearchContext.Provider value={value}>
      {children}
    </CatalogBrowseSearchContext.Provider>
  );
}

export function useCatalogBrowseSearch(): CatalogBrowseSearchContextValue {
  const ctx = useContext(CatalogBrowseSearchContext);
  if (!ctx) {
    throw new Error(
      "useCatalogBrowseSearch must be used within CatalogBrowseSearchProvider on Movies/Series"
    );
  }
  return ctx;
}

export function useCatalogBrowseSearchOptional(): CatalogBrowseSearchContextValue | null {
  return useContext(CatalogBrowseSearchContext);
}

export function catalogBrowseSearchPlaceholder(
  kind: CatalogBrowseKind
): string {
  return kind === "movies" ? "Search movies…" : "Search series…";
}
