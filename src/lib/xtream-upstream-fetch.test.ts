import { describe, expect, it, vi } from "vitest";
import { fetchXtreamPanelWithRetry } from "./xtream-upstream-fetch";

describe("fetchXtreamPanelWithRetry", () => {
  it("retries on 502 then returns success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad", { status: 502 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await fetchXtreamPanelWithRetry("http://example.com/player_api.php", {
      method: "GET",
    });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    vi.unstubAllGlobals();
  });
});
