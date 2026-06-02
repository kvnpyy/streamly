import { describe, expect, it, vi, afterEach } from "vitest";
import { getAppVersionLabel } from "./app-version";

describe("getAppVersionLabel", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("formats package version with v prefix", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "0.1.0");
    expect(getAppVersionLabel()).toBe("v0.1.0");
  });

  it("strips duplicate v prefix", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "v2.3.4");
    expect(getAppVersionLabel()).toBe("v2.3.4");
  });
});
