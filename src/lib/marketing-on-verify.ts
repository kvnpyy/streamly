import "server-only";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { userEligibleForMarketingEmail } from "@/lib/marketing-eligibility";
import { syncMarketingContactToResend } from "@/lib/marketing-resend";
import { sendMarketingWelcomeEmail } from "@/lib/marketing-welcome-email";
import { eq } from "drizzle-orm";

/**
 * After first successful email verification: sync opted-in users to Resend Contacts
 * and send a one-time welcome email. Failures are logged; verification still succeeds.
 */
export async function runPostVerificationMarketing(userId: string): Promise<void> {
  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerifiedAt: users.emailVerifiedAt,
      marketingOptIn: users.marketingOptIn,
      marketingUnsubscribedAt: users.marketingUnsubscribedAt,
      welcomeEmailSentAt: users.welcomeEmailSentAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user || !userEligibleForMarketingEmail(user)) return;

  const sync = await syncMarketingContactToResend({
    email: user.email,
    firstName: user.name,
    unsubscribed: false,
  });
  if (!sync.ok) {
    console.warn("[marketing:on-verify] resend contact sync", sync.reason, user.email);
  }

  if (user.welcomeEmailSentAt != null) return;

  const mailed = await sendMarketingWelcomeEmail({
    userId: user.id,
    email: user.email,
    name: user.name,
  });
  if (mailed.ok) {
    await getDb()
      .update(users)
      .set({ welcomeEmailSentAt: new Date() })
      .where(eq(users.id, userId));
  } else {
    console.warn("[marketing:on-verify] welcome email", mailed.reason, user.email);
  }
}
