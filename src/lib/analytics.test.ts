import { afterEach, describe, expect, it, vi } from "vitest";
import { gaMeasurementId } from "@/lib/analytics";

describe("gaMeasurementId", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to production GA4 id when unset", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", undefined);
    expect(gaMeasurementId()).toBe("G-29BPRZW3R6");
  });

  it("returns override when set", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "G-TEST123");
    expect(gaMeasurementId()).toBe("G-TEST123");
  });

  it("returns null when explicitly disabled", () => {
    vi.stubEnv("NEXT_PUBLIC_GA_MEASUREMENT_ID", "");
    expect(gaMeasurementId()).toBeNull();
  });
});
