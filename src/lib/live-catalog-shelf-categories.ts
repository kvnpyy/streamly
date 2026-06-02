import type { TvRegion } from "@/lib/geo-continent";
import type { Category, XtreamCredentials } from "@/lib/xtream-types";

function catalogHeaders(creds: XtreamCredentials): Record<string, string> {
  return {
    "x-iptv-server": creds.server,
    "x-iptv-username": creds.username,
    "x-iptv-password": creds.password,
  };
}

export type ShelfCategoriesPage = {
  categories: Category[];
  nextOffset: number;
  hasMore: boolean;
};

export async function fetchShelfCategoriesPage(
  creds: XtreamCredentials,
  opts: {
    region: TvRegion;
    offset: number;
    limit?: number;
    signal?: AbortSignal;
  }
): Promise<ShelfCategoriesPage> {
  const url = new URL(
    `${typeof window !== "undefined" ? window.location.origin : ""}/api/live/catalog/shelf-categories`
  );
  url.searchParams.set("region", opts.region);
  url.searchParams.set("offset", String(opts.offset));
  url.searchParams.set("limit", String(opts.limit ?? 32));

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: catalogHeaders(creds),
    signal: opts.signal,
    cache: "default",
  });
  if (!res.ok) {
    throw new Error(`Could not load shelf categories (${res.status}).`);
  }
  return (await res.json()) as ShelfCategoriesPage;
}
