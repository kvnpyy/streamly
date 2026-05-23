"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/store/auth";
import { xtream } from "@/lib/xtream";
import {
  type EpgListingLike,
  epgListingsHaveParsableTimes,
  epgListingsOverlapWindow,
  epgProgramRangeUnixSec,
} from "@/lib/epg-time";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * How long short EPG (`get_short_epg`) is treated as fresh in React Query.
 * Longer = fewer provider hits and faster tiles/search (cache hits); shorter =
 * closer to real-time “now playing”. Shared by {@link useShortEPG} and live
 * programme search batching so keys dedupe.
 */
export const SHORT_EPG_STALE_MS = 30 * 60 * 1000;

/**
 * Fetch a few upcoming EPG entries for a given live channel. Programs are
 * returned with `start_timestamp` / `stop_timestamp` in seconds.
 */
export function useShortEPG(
  streamId?: number,
  limit = 6,
  queryEnabled = true
) {
  const creds = useAuth((s) => s.creds);
  return useQuery({
    queryKey: ["short-epg", creds?.server, creds?.username, streamId, limit],
    queryFn: ({ signal }) =>
      xtream.shortEPG(creds!, streamId!, limit, signal),
    enabled:
      queryEnabled && !!creds && !!streamId && Number.isFinite(streamId),
    staleTime: SHORT_EPG_STALE_MS,
  });
}

/**
 * Fetch the full per-channel EPG (multi-day if the provider has it). Use
 * for the Guide view or as a richer fallback when get_short_epg is empty.
 */
export function useFullEPG(streamId?: number, enabled = true) {
  const creds = useAuth((s) => s.creds);
  return useQuery({
    queryKey: ["full-epg", creds?.server, creds?.username, streamId],
    queryFn: ({ signal }) =>
      xtream.simpleDataTable(creds!, streamId!, signal),
    enabled:
      enabled && !!creds && !!streamId && Number.isFinite(streamId),
    staleTime: 5 * 60_000,
  });
}

/**
 * Public-EPG fallback (iptv-org via epg.pw). Typically gated upstream so we
 * don’t hammer epg.pw until provider endpoints miss — **`useGuideChannelEPG`**
 * opts into parallel fetch against rows once country + name are known.
 */
export function useExternalEPG(opts: {
  channelName?: string;
  country?: string;
  enabled: boolean;
  /** Max programmes returned (Guide uses more than tiles). Clamped server-side. */
  programmeLimit?: number;
}) {
  const { channelName, country, enabled, programmeLimit = 8 } = opts;
  const lim = Math.max(1, Math.min(48, programmeLimit || 8));
  return useQuery({
    queryKey: ["ext-epg", country, channelName, lim],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        name: channelName!,
        country: country!,
        limit: String(lim),
      });
      const res = await fetch(`/api/external-epg?${params.toString()}`, {
        signal,
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`external-epg ${res.status}`);
      return (await res.json()) as {
        epg_listings: Array<{
          id: string;
          epg_id: string;
          title: string;
          description?: string;
          channel_id: string;
          start: string;
          end: string;
          start_timestamp: string;
          stop_timestamp: string;
          now_playing?: number;
        }>;
        source: string;
        matched_name?: string | null;
        error?: string;
      };
    },
    enabled: enabled && !!channelName && !!country,
    staleTime: 5 * 60_000,
    retry: false, // first hit may take 30s+ to download a country file; don't pile on
  });
}

/** Extra programmes when using short EPG as Guide fallback (12h grid needs depth). */
const GUIDE_SHORT_FALLBACK_LIMIT = 96;
const GUIDE_EXTERNAL_PROGRAMME_LIMIT = 40;

/**
 * Guide-specific EPG pipeline:
 * - **`get_simple_data_table`** + **`get_short_epg`** run **in parallel** (panels
 *   often only populate one — waiting sequentially hid short data).
 * - **iptv-org** runs **in parallel whenever country + name are known** so rows
 *   don’t sit blank until both provider calls finish.
 * - Provider rows win only if **at least one entry has parseable times**; panels
 *   often return non-empty `epg_listings` with junk timestamps — that used to
 *   block iptv-org entirely.
 * - If **`viewportSec`** is set and provider rows never overlap that window
 *   (wrong timezone / stale listings), we **still use iptv-org** so the grid
 *   isn’t blank while parsable junk blocks the fallback.
 */
export function useGuideChannelEPG(opts: {
  streamId: number;
  channelName: string;
  country?: string;
  /** Guide grid bounds (unix sec); use same padding as row filtering. */
  viewportSec?: { lo: number; hi: number };
  /**
   * When false, no EPG queries run (row not yet in the guide scrollport).
   * Avoids dozens of parallel provider + iptv-org requests while scrolling.
   */
  epgEnabled?: boolean;
}) {
  const { streamId, channelName, country, viewportSec, epgEnabled = true } =
    opts;

  const full = useFullEPG(streamId, epgEnabled);
  const short = useShortEPG(streamId, GUIDE_SHORT_FALLBACK_LIMIT, epgEnabled);

  const mergedProvider = useMemo(() => {
    const fromFull =
      full.status === "success" ? (full.data?.epg_listings ?? []) : [];
    const fromShort =
      short.status === "success" ? (short.data?.epg_listings ?? []) : [];
    if (epgListingsHaveParsableTimes(fromFull)) return fromFull;
    if (epgListingsHaveParsableTimes(fromShort)) return fromShort;
    return [];
  }, [full.status, full.data, short.status, short.data]);

  const ext = useExternalEPG({
    channelName,
    country,
    programmeLimit: GUIDE_EXTERNAL_PROGRAMME_LIMIT,
    enabled: epgEnabled && !!channelName && !!country,
  });

  const providerOverlapsViewport = useMemo(() => {
    if (!viewportSec || mergedProvider.length === 0) return true;
    return epgListingsOverlapWindow(
      mergedProvider,
      viewportSec.lo,
      viewportSec.hi
    );
  }, [mergedProvider, viewportSec]);

  const extRows = ext.data?.epg_listings;

  const programs = useMemo(() => {
    const extList = extRows ?? [];
    if (mergedProvider.length === 0) return extList;
    if (!viewportSec || providerOverlapsViewport) return mergedProvider;
    if (extList.length > 0) return extList;
    return mergedProvider;
  }, [
    mergedProvider,
    extRows,
    viewportSec,
    providerOverlapsViewport,
  ]);

  const sourceIsExternal = useMemo(() => {
    if ((extRows?.length ?? 0) === 0) return false;
    if (mergedProvider.length === 0) return true;
    if (!viewportSec) return false;
    return !providerOverlapsViewport;
  }, [
    extRows,
    mergedProvider.length,
    viewportSec,
    providerOverlapsViewport,
  ]);

  const needsExt =
    !!channelName &&
    !!country &&
    (mergedProvider.length === 0 || !providerOverlapsViewport);

  const providerResolved = full.isFetched && short.isFetched;
  const extSettled =
    !needsExt || ext.isFetched || ext.isError;

  const isResolved = providerResolved && extSettled;

  const providerLoading =
    mergedProvider.length === 0 &&
    (full.isLoading || short.isLoading);

  const waitingExtForViewport =
    !!viewportSec &&
    mergedProvider.length > 0 &&
    !providerOverlapsViewport &&
    (extRows?.length ?? 0) === 0 &&
    ext.isLoading;

  const isLoading =
    providerLoading ||
    waitingExtForViewport ||
    (needsExt && ext.isLoading && programs.length === 0);

  if (!epgEnabled) {
    return {
      programs: [],
      isLoading: true,
      isResolved: false,
      sourceIsExternal: false,
      matchedName: null,
    };
  }

  return {
    programs,
    isLoading,
    isResolved,
    sourceIsExternal,
    matchedName: ext.data?.matched_name ?? null,
  };
}

/**
 * Smart EPG hook for channel tiles. Three-stage fallback:
 *   1. Provider `get_short_epg` (fastest, 4–6 entries).
 *   2. Provider `get_simple_data_table` if short_epg is empty (full
 *      multi-day schedule when the provider has it).
 *   3. Public iptv-org/epg.pw lookup if both provider endpoints come
 *      back empty AND we know the country (fuzzy-matched by channel
 *      name).
 *
 * Pass `hasEpgChannelId: false` only when you want to skip provider EPG
 * entirely. Omitting the prop tries stages 1–2 whenever `streamId` is set —
 * many panels omit `epg_channel_id` on streams but still serve EPG by
 * `stream_id`.
 */
export function useChannelEPG(opts: {
  streamId?: number;
  hasEpgChannelId?: boolean;
  enabled?: boolean;
  channelName?: string;
  country?: string;
}) {
  const {
    streamId,
    hasEpgChannelId,
    enabled = true,
    channelName,
    country,
  } = opts;
  const canFetchProvider =
    enabled && !!streamId && hasEpgChannelId !== false;
  const short = useShortEPG(canFetchProvider ? streamId : undefined, 6);
  const shortList =
    short.isSuccess ? (short.data?.epg_listings ?? []) : [];
  const shortParsable = epgListingsHaveParsableTimes(shortList);
  /** Treat unusable short payloads like empty so we still hit full + iptv-org. */
  const shortEffectivelyEmpty =
    short.isFetched &&
    (!short.isSuccess ||
      shortList.length === 0 ||
      !shortParsable);

  const full = useFullEPG(
    canFetchProvider && shortEffectivelyEmpty ? streamId : undefined
  );
  const fullList =
    full.isSuccess ? (full.data?.epg_listings ?? []) : [];
  const fullParsable = epgListingsHaveParsableTimes(fullList);

  const providerPrograms =
    short.isSuccess && shortParsable && shortList.length > 0
      ? shortList
      : full.isSuccess && fullParsable && fullList.length > 0
        ? fullList
        : [];

  // Provider exhausted? Skipped (`hasEpgChannelId: false`), or no usable rows.
  const providerExhausted =
    !canFetchProvider ||
    (short.isFetched && full.isFetched && providerPrograms.length === 0);

  const ext = useExternalEPG({
    channelName,
    country,
    enabled:
      enabled &&
      providerExhausted &&
      providerPrograms.length === 0 &&
      !!channelName &&
      !!country,
  });

  const programs =
    providerPrograms.length > 0
      ? providerPrograms
      : ext.data?.epg_listings || [];
  const sourceIsExternal =
    providerPrograms.length === 0 && (ext.data?.epg_listings?.length ?? 0) > 0;

  const awaitingFull =
    short.isFetched &&
    !(short.isSuccess && shortParsable && shortList.length > 0);
  const needsExtTile =
    providerExhausted && !!channelName && !!country;

  return {
    programs,
    isLoading:
      short.isLoading ||
      (awaitingFull && full.isLoading) ||
      (needsExtTile && ext.isLoading && programs.length === 0),
    isResolved:
      short.isFetched &&
      (!awaitingFull || full.isFetched) &&
      (!needsExtTile || ext.isFetched || ext.isError),
    skipped: !canFetchProvider && !ext.data,
    sourceIsExternal,
    matchedName: ext.data?.matched_name ?? null,
  };
}

/** Live ticking "now" timestamp in seconds, updated every minute. */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Returns a [ref, inView] tuple. The element starts as not-in-view; once
 * the IntersectionObserver fires intersecting at least once, `inView`
 * becomes true and stays true (sticky), so we only fetch EPG per channel
 * once per session and don't toggle on/off as the user scrolls.
 */
export function useInView<T extends Element>(
  rootMargin = "200px"
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { rootMargin, threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView, rootMargin]);
  return [ref, inView];
}

/**
 * Like {@link useInView}, but uses a scroll container as the intersection root
 * (required when the target lives inside `overflow: auto`, e.g. Live TV guide).
 */
export function useInViewWithin<T extends HTMLElement>(
  root: HTMLElement | null,
  rootMargin = "72px 0px 180px 0px"
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (inView) return;
    const el = ref.current;
    if (!root || !el || typeof IntersectionObserver === "undefined") {
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          obs.disconnect();
        }
      },
      { root, rootMargin, threshold: 0 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [inView, root, rootMargin]);
  return [ref, inView];
}

/** Decode IPTV EPG titles (provider often base64-encodes them). */
export function decodeEpgText(s: string | undefined | null): string {
  if (!s) return "";
  // Heuristic: base64 strings only contain A–Z a–z 0–9 + / =, are usually
  // not sentences with spaces. Try to decode and detect mojibake.
  if (/^[A-Za-z0-9+/=\s]+$/.test(s) && s.length % 4 === 0 && s.length > 8) {
    try {
      const decoded =
        typeof atob !== "undefined"
          ? decodeURIComponent(escape(atob(s)))
          : Buffer.from(s, "base64").toString("utf-8");
      // Reject if decoded contains lots of non-printable characters
      const printable = decoded.replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, "");
      if (printable.length / decoded.length > 0.85) return decoded;
    } catch {
      /* not base64 */
    }
  }
  return s;
}

/** Resolve current programme title from Xtream-style listings (shared by tiles + live search batch). */
export function nowPlayingTitleFromListings(
  listings: EpgListingLike[],
  nowUnixSec: number
): string | undefined {
  let current = listings.find((p) => {
    const r = epgProgramRangeUnixSec(p);
    return r !== null && r.start <= nowUnixSec && nowUnixSec < r.end;
  });
  if (!current) {
    current = listings.find(
      (p) => Number((p as { now_playing?: unknown }).now_playing) === 1
    );
  }
  const raw = (current as { title?: string } | undefined)?.title;
  return raw ? decodeEpgText(raw) : undefined;
}
