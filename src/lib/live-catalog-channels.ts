import { catalogKeys } from "@/lib/catalog-queries";
import { LIVE_GUIDE_MAX_CHANNELS } from "@/lib/live-guide-limits";
import type { XtreamCredentials } from "@/lib/xtream-types";
import type { LiveStream } from "@/lib/xtream-types";
import type { UseQueryOptions } from "@tanstack/react-query";

export type LiveCategoryChannelsResponse = {
  streams: LiveStream[];
};

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

export async function fetchLiveCategoryChannels(
  creds: XtreamCredentials,
  opts: {
    categoryId: string | "all";
    limit?: number;
    streamIds?: number[];
    signal?: AbortSignal;
  }
): Promise<LiveStream[]> {
  const url = new URL(`${typeof window !== "undefined" ? window.location.origin : ""}/api/live/catalog/channels`);
  if (opts.streamIds?.length) {
    url.searchParams.set("ids", opts.streamIds.slice(0, 48).join(","));
  } else {
    url.searchParams.set("categoryId", opts.categoryId === "all" ? "all" : String(opts.categoryId));
  }
  url.searchParams.set("limit", String(opts.limit ?? LIVE_GUIDE_MAX_CHANNELS));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: catalogHeaders(creds),
    signal: opts.signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Could not load channels (${res.status}).`);
  }
  const data = (await res.json()) as LiveCategoryChannelsResponse;
  return Array.isArray(data.streams) ? data.streams : [];
}

export function liveCategoryChannelsQueryOptions(
  creds: XtreamCredentials,
  categoryId: string | "all",
  limit: number,
  enabled: boolean
): UseQueryOptions<LiveStream[], Error> {
  return {
    queryKey: [...catalogKeys.live(creds), "channels", categoryId, limit] as const,
    queryFn: ({ signal }) =>
      fetchLiveCategoryChannels(creds, { categoryId, limit, signal }),
    enabled,
    staleTime: 60_000,
    gcTime: 120_000,
    structuralSharing: false,
    refetchOnWindowFocus: false,
  };
}
