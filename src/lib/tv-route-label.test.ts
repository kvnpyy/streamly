import { describe, expect, it } from "vitest";
import { tvRouteLabel } from "./tv-route-label";

describe("tvRouteLabel", () => {
  it("labels main TV routes", () => {
    expect(tvRouteLabel("/app")).toBe("Home");
    expect(tvRouteLabel("/app/live")).toBe("Live TV");
    expect(tvRouteLabel("/app/movies")).toBe("Movies");
    expect(tvRouteLabel("/app/series")).toBe("TV Series");
    expect(tvRouteLabel("/app/settings")).toBe("Settings");
  });
});
