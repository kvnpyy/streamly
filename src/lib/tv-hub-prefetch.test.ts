import { describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { catalogKeys } from "@/lib/catalog-queries";
import {
  prefetchTvHubCatalogs,
  prefetchTvHubRoutes,
} from "@/lib/tv-hub-prefetch";

const creds = {
  server: "http://example.com",
  username: "u",
  password: "p",
};

describe("prefetchTvHubRoutes", () => {
  it("prefetches all hub routes when no target", () => {
    const prefetch = vi.fn();
    prefetchTvHubRoutes(prefetch);
    expect(prefetch).toHaveBeenCalledTimes(4);
    expect(prefetch).toHaveBeenCalledWith("/app/live");
    expect(prefetch).toHaveBeenCalledWith("/app/movies");
    expect(prefetch).toHaveBeenCalledWith("/app/series");
    expect(prefetch).toHaveBeenCalledWith("/app/settings");
  });

  it("prefetches a single route when targeted", () => {
    const prefetch = vi.fn();
    prefetchTvHubRoutes(prefetch, "/app/movies");
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith("/app/movies");
  });
});

describe("prefetchTvHubCatalogs", () => {
  it("skips live prefetch when catalog is already cached", () => {
    const qc = new QueryClient();
    qc.setQueryData(catalogKeys.live(creds), { categories: [] });
    const spy = vi.spyOn(qc, "prefetchQuery");
    prefetchTvHubCatalogs(creds, qc, "/app/live");
    expect(spy).not.toHaveBeenCalled();
  });

  it("prefetches only movies slim catalog when targeted", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "prefetchQuery").mockResolvedValue(undefined);
    prefetchTvHubCatalogs(creds, qc, "/app/movies");
    expect(spy).toHaveBeenCalledTimes(1);
    const call = spy.mock.calls[0]?.[0];
    expect(call?.queryKey).toEqual([...catalogKeys.vodCatalog(creds), "slim"]);
  });
});
