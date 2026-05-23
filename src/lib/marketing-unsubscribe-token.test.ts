import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  createMarketingUnsubscribeToken,
  verifyMarketingUnsubscribeToken,
} from "./marketing-unsubscribe-token";

describe("marketing unsubscribe token", () => {
  const prev = process.env.AUTH_SECRET;

  beforeEach(() => {
    process.env.AUTH_SECRET = "test-marketing-secret-min-16-chars!!";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = prev;
  });

  it("round-trips user id", () => {
    const token = createMarketingUnsubscribeToken("user-abc-123");
    expect(token).toBeTruthy();
    expect(verifyMarketingUnsubscribeToken(token!)).toBe("user-abc-123");
  });

  it("rejects tampered tokens", () => {
    const token = createMarketingUnsubscribeToken("user-abc-123")!;
    expect(verifyMarketingUnsubscribeToken(token + "x")).toBeNull();
  });
});
