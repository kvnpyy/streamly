import { describe, expect, it } from "vitest";

import {
  isReviewPanelCreds,
  reviewPanelServerUrl,
  REVIEW_PANEL_PASSWORD,
  REVIEW_PANEL_USERNAME,
} from "@/lib/review-panel/credentials";
import { reviewPanelAction } from "@/lib/review-panel/catalog";

const CREDS = {
  server: "https://iptvwebplayer.org/api/review-panel",
  username: REVIEW_PANEL_USERNAME,
  password: REVIEW_PANEL_PASSWORD,
};

describe("review panel credentials", () => {
  it("accepts default samsung review account on review-panel server", () => {
    expect(isReviewPanelCreds(CREDS)).toBe(true);
  });

  it("rejects wrong password", () => {
    expect(
      isReviewPanelCreds({ ...CREDS, password: "wrong" })
    ).toBe(false);
  });

  it("rejects non-review server", () => {
    expect(
      isReviewPanelCreds({
        ...CREDS,
        server: "https://example.com",
      })
    ).toBe(false);
  });

  it("builds public server URL", () => {
    expect(reviewPanelServerUrl("https://iptvwebplayer.org")).toBe(
      "https://iptvwebplayer.org/api/review-panel"
    );
  });
});

describe("review panel catalog", () => {
  it("authenticates with auth=1", () => {
    const auth = reviewPanelAction(null, {}, CREDS) as {
      user_info: { auth: number };
    };
    expect(auth.user_info.auth).toBe(1);
  });

  it("returns live channels with direct_source", () => {
    const rows = reviewPanelAction("get_live_streams", {}, CREDS) as Array<{
      stream_id: number;
      direct_source?: string;
    }>;
    expect(rows.length).toBeGreaterThanOrEqual(4);
    expect(rows[0]?.direct_source).toMatch(/^https:\/\//);
  });

  it("returns movies and series", () => {
    const movies = reviewPanelAction("get_vod_streams", {}, CREDS) as unknown[];
    const series = reviewPanelAction("get_series", {}, CREDS) as unknown[];
    expect(movies.length).toBeGreaterThanOrEqual(3);
    expect(series.length).toBeGreaterThanOrEqual(2);
  });

  it("returns vod info with playable direct_source", () => {
    const info = reviewPanelAction(
      "get_vod_info",
      { vod_id: "1001" },
      CREDS
    ) as { movie_data: { direct_source?: string } };
    expect(info.movie_data.direct_source).toMatch(/\.mp4$/);
  });

  it("returns series episodes", () => {
    const info = reviewPanelAction(
      "get_series_info",
      { series_id: "2001" },
      CREDS
    ) as { episodes: Record<string, Array<{ direct_source?: string }>> };
    expect(info.episodes["1"]?.length).toBeGreaterThanOrEqual(2);
    expect(info.episodes["1"]?.[0]?.direct_source).toMatch(/\.mp4$/);
  });
});
