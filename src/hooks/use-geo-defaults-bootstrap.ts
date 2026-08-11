"use client";

import {
  coerceTvRegion,
  defaultVodLanguageForCountry,
  defaultVodLanguageForRegion,
  detectRegionFromTimezone,
  isBrazilianTimezone,
  type TvRegion,
} from "@/lib/geo-continent";
import { browseAccountKey, usePrefs } from "@/store/preferences";
import { useAuth } from "@/store/auth";
import { scheduleWhenIdle } from "@/lib/defer-idle";
import { isMobileShellWidth } from "@/lib/shell-layout";
import { useEffect, useRef } from "react";

type GeoDetectResponse = {
  country: string | null;
  region: TvRegion | null;
  language: string | null;
};

let geoDetectPromise: Promise<GeoDetectResponse> | null = null;

function fetchGeoDetect(): Promise<GeoDetectResponse> {
  if (!geoDetectPromise) {
    geoDetectPromise = fetch("/api/geo/detect", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("geo detect failed");
        return (await res.json()) as GeoDetectResponse;
      })
      .catch(() => ({
        country: null,
        region: null,
        language: null,
      }));
  }
  return geoDetectPromise;
}

/**
 * On first visit, set Live TV region from IP (CDN headers) with timezone fallback,
 * and default Movies/Series language when the user has not chosen one yet.
 */
export function useGeoDefaultsBootstrap(opts?: { disabled?: boolean }) {
  const disabled = opts?.disabled ?? false;
  const creds = useAuth((s) => s.creds);
  const tvRegion = usePrefs((s) => s.tvRegionFilter);
  const setTvRegion = usePrefs((s) => s.setTvRegionFilter);
  const browseByAccount = usePrefs((s) => s.browseByAccount);
  const setBrowsePref = usePrefs((s) => s.setBrowsePref);
  const regionBootstrapped = useRef(false);
  const languageBootstrappedFor = useRef<string | null>(null);

  useEffect(() => {
    if (disabled || tvRegion !== null || regionBootstrapped.current) return;
    regionBootstrapped.current = true;

    let cancelled = false;

    const start = () => {
      void (async () => {
        const data = await fetchGeoDetect();
        if (cancelled) return;

        const resolved =
          coerceTvRegion(data.region) ?? detectRegionFromTimezone();
        setTvRegion(resolved);
      })();
    };

    if (isMobileShellWidth()) {
      const cancelIdle = scheduleWhenIdle(start, 4_000);
      return () => {
        cancelled = true;
        cancelIdle();
      };
    }

    start();
    return () => {
      cancelled = true;
    };
  }, [disabled, tvRegion, setTvRegion]);

  useEffect(() => {
    if (disabled || !creds) return;
    const accountKey = browseAccountKey(creds);
    if (languageBootstrappedFor.current === accountKey) return;

    const prefs = browseByAccount[accountKey];
    const needsMovies = prefs?.moviesLanguage === undefined;
    const needsSeries = prefs?.seriesLanguage === undefined;
    if (!needsMovies && !needsSeries) {
      languageBootstrappedFor.current = accountKey;
      return;
    }

    let cancelled = false;

    const start = () => {
      void (async () => {
        const data = await fetchGeoDetect();
        if (cancelled) return;

        const region =
          coerceTvRegion(tvRegion) ??
          coerceTvRegion(data.region) ??
          detectRegionFromTimezone();
        // Brazil is LatAm for Live TV but Portuguese for Movies/Series.
        const defaultLang =
          data.language ??
          defaultVodLanguageForCountry(data.country) ??
          (isBrazilianTimezone() ? "PT" : null) ??
          defaultVodLanguageForRegion(region);
        if (!defaultLang) {
          languageBootstrappedFor.current = accountKey;
          return;
        }

        const patch: {
          moviesLanguage?: string;
          seriesLanguage?: string;
        } = {};
        if (needsMovies) patch.moviesLanguage = defaultLang;
        if (needsSeries) patch.seriesLanguage = defaultLang;
        setBrowsePref(accountKey, patch);
        languageBootstrappedFor.current = accountKey;
      })();
    };

    if (isMobileShellWidth()) {
      const cancelIdle = scheduleWhenIdle(start, 5_000);
      return () => {
        cancelled = true;
        cancelIdle();
      };
    }

    start();
    return () => {
      cancelled = true;
    };
  }, [disabled, creds, browseByAccount, setBrowsePref, tvRegion]);
}
