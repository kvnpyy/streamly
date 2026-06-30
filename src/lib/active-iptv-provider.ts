import { getDb } from "@/db";
import { iptvProviderAccounts, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function readUserActiveIptvProviderAccountId(
  userId: string
): Promise<string | null> {
  const rows = await getDb()
    .select({ activeIptvProviderAccountId: users.activeIptvProviderAccountId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const id = rows[0]?.activeIptvProviderAccountId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Set the user's cross-device active playlist (must belong to the user when non-null). */
export async function setUserActiveIptvProviderAccountId(
  userId: string,
  accountId: string | null
): Promise<boolean> {
  if (accountId) {
    const rows = await getDb()
      .select({ id: iptvProviderAccounts.id })
      .from(iptvProviderAccounts)
      .where(
        and(
          eq(iptvProviderAccounts.id, accountId),
          eq(iptvProviderAccounts.userId, userId)
        )
      )
      .limit(1);
    if (!rows[0]) return false;
  }

  await getDb()
    .update(users)
    .set({ activeIptvProviderAccountId: accountId })
    .where(eq(users.id, userId));
  return true;
}

/** Clear active pointer when the saved row is deleted. */
export async function clearUserActiveIptvProviderIfMatches(
  userId: string,
  deletedAccountId: string
): Promise<void> {
  const active = await readUserActiveIptvProviderAccountId(userId);
  if (active === deletedAccountId) {
    await setUserActiveIptvProviderAccountId(userId, null);
  }
}
