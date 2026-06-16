"use client";

import { normalizeVodLanguageCode } from "@/lib/vod-language";
import { usePrefs } from "@/store/preferences";
import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { ReadonlyURLSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

type LanguagePrefKey = "moviesLanguage" | "seriesLanguage";

export function useVodLanguageBrowse(opts: {
  accountKey: string;
  prefKey: LanguagePrefKey;
  languages: string[];
  searchParams: ReadonlyURLSearchParams;
  pathname: string;
  router: AppRouterInstance;
}) {
  const { accountKey, prefKey, languages, searchParams, pathname, router } =
    opts;

  const savedLanguage = usePrefs(
    (s) => s.browseByAccount[accountKey]?.[prefKey]
  );
  const setBrowsePref = usePrefs((s) => s.setBrowsePref);
  const [languageOverride, setLanguageOverride] = useState<
    string | "all" | null
  >(null);

  const languageSet = useMemo(() => new Set(languages), [languages]);

  const fromUrlLanguage = useMemo(() => {
    const raw = searchParams.get("lang")?.trim();
    if (!raw || raw === "all") return null;
    const code = normalizeVodLanguageCode(raw);
    if (!code || !languageSet.has(code)) return null;
    return code;
  }, [searchParams, languageSet]);

  const prefsLanguage: string | "all" =
    savedLanguage === undefined
      ? "all"
      : savedLanguage === "all"
        ? "all"
        : String(savedLanguage);

  const selectedBase = languageOverride ?? fromUrlLanguage ?? prefsLanguage;

  const selectedLanguage =
    selectedBase !== "all" &&
    languages.length > 0 &&
    !languageSet.has(String(selectedBase))
      ? "all"
      : selectedBase;

  useEffect(() => {
    if (selectedBase === selectedLanguage) return;
    setBrowsePref(accountKey, { [prefKey]: "all" });
    queueMicrotask(() => setLanguageOverride(null));
  }, [selectedBase, selectedLanguage, accountKey, prefKey, setBrowsePref]);

  useEffect(() => {
    if (!fromUrlLanguage) return;
    queueMicrotask(() => {
      setBrowsePref(accountKey, { [prefKey]: fromUrlLanguage });
    });
  }, [fromUrlLanguage, accountKey, prefKey, setBrowsePref]);

  const setLanguage = useCallback(
    (v: string | "all") => {
      const next = v === "all" ? "all" : String(v);
      setLanguageOverride(next);
      setBrowsePref(accountKey, { [prefKey]: next });
      const params = new URLSearchParams(searchParams.toString());
      if (next === "all") params.delete("lang");
      else params.set("lang", next);
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [
      accountKey,
      prefKey,
      setBrowsePref,
      searchParams,
      pathname,
      router,
    ]
  );

  const languageActive = selectedLanguage !== "all";

  return {
    selectedLanguage,
    setLanguage,
    languageActive,
  };
}
