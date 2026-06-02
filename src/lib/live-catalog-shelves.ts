import { catalogKeys } from "@/lib/catalog-queries";
import type { TvRegion } from "@/lib/geo-continent";
import type { LiveStream, XtreamCredentials } from "@/lib/xtream-types";

export type ShelfPreviewPayload = {
  streams: LiveStream[];
  total: number;
};

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

export async function fetchLiveShelfPreviews(
  creds: XtreamCredentials,
  opts: {
    categoryIds: string[];
    limitPerShelf: number;
    region?: TvRegion;
    signal?: AbortSignal;
  }
): Promise<Record<string, ShelfPreviewPayload>> {
  if (!opts.categoryIds.length) return {};
  const url = new URL(
    `${typeof window !== "undefined" ? window.location.origin : ""}/api/live/catalog/shelves`
  );
  url.searchParams.set("categoryIds", opts.categoryIds.slice(0, 8).join(","));
  url.searchParams.set("limit", String(opts.limitPerShelf));
  if (opts.region && opts.region !== "All") {
    url.searchParams.set("region", opts.region);
  }

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: catalogHeaders(creds),
    signal: opts.signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Could not load shelf previews (${res.status}).`);
  }
  const data = (await res.json()) as {
    shelves?: Record<string, ShelfPreviewPayload>;
  };
  return data.shelves ?? {};
}

export function liveShelfPreviewsQueryKey(
  creds: XtreamCredentials,
  categoryIds: string[],
  limitPerShelf: number,
  region: TvRegion
) {
  return [
    ...catalogKeys.live(creds),
    "shelf-previews",
    region,
    limitPerShelf,
    ...categoryIds,
  ] as const;
}
