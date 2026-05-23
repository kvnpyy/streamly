import { describe, expect, it } from "vitest";
import { clearAuthRateLimitBuckets } from "./auth-rate-limit";
import { hashAuthToken } from "./auth-token-secret";

describe("hashAuthToken", () => {
  it("is stable for the same input", () => {
    const a = hashAuthToken("hello-token");
    const b = hashAuthToken("hello-token");
    expect(a).toBe(b);
    expect(a.length).toBe(64);
  });

  it("differs for different inputs", () => {
    expect(hashAuthToken("a")).not.toBe(hashAuthToken("b"));
  });
});

describe("clearAuthRateLimitBuckets", () => {
  it("runs without throw", () => {
    expect(() => clearAuthRateLimitBuckets()).not.toThrow();
  });
});
