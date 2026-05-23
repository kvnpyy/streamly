import { describe, expect, it } from "vitest";
import { userEligibleForMarketingEmail } from "./marketing-eligibility";

describe("userEligibleForMarketingEmail", () => {
  const verified = new Date();

  it("requires verification, opt-in, and no unsubscribe", () => {
    expect(
      userEligibleForMarketingEmail({
        emailVerifiedAt: verified,
        marketingOptIn: true,
        marketingUnsubscribedAt: null,
      })
    ).toBe(true);
    expect(
      userEligibleForMarketingEmail({
        emailVerifiedAt: null,
        marketingOptIn: true,
        marketingUnsubscribedAt: null,
      })
    ).toBe(false);
    expect(
      userEligibleForMarketingEmail({
        emailVerifiedAt: verified,
        marketingOptIn: false,
        marketingUnsubscribedAt: null,
      })
    ).toBe(false);
    expect(
      userEligibleForMarketingEmail({
        emailVerifiedAt: verified,
        marketingOptIn: true,
        marketingUnsubscribedAt: new Date(),
      })
    ).toBe(false);
  });
});
