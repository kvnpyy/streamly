import "server-only";

import { getDb } from "@/db";
import { users } from "@/db/schema";
import { markMarketingContactUnsubscribedInResend } from "@/lib/marketing-resend";
import { eq } from "drizzle-orm";

/** Mark user unsubscribed locally and in Resend (best-effort). */
export async function unsubscribeUserFromMarketing(
  userId: string
): Promise<{ email: string } | null> {
  const rows = await getDb()
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user) return null;

  const now = new Date();
  await getDb()
    .update(users)
    .set({
      marketingOptIn: false,
      marketingUnsubscribedAt: now,
    })
    .where(eq(users.id, userId));

  const sync = await markMarketingContactUnsubscribedInResend(user.email);
  if (!sync.ok) {
    console.warn("[marketing:unsubscribe] resend", sync.reason, user.email);
  }

  return { email: user.email };
}
