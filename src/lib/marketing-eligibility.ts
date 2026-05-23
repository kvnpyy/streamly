import type { User } from "@/db/schema";

/** Verified, opted in, and not unsubscribed — eligible for welcome + product updates. */
export function userEligibleForMarketingEmail(
  user: Pick<
    User,
    | "emailVerifiedAt"
    | "marketingOptIn"
    | "marketingUnsubscribedAt"
  >
): boolean {
  return (
    user.emailVerifiedAt != null &&
    user.marketingOptIn === true &&
    user.marketingUnsubscribedAt == null
  );
}
