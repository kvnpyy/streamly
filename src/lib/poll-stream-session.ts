import type { Session } from "next-auth";
import { getSession } from "next-auth/react";

/** Poll NextAuth until a Streamly user session is available (mobile Safari race). */
export async function pollStreamSession(maxMs = 5000): Promise<Session | null> {
  const deadline = Date.now() + Math.max(0, maxMs);
  let session: Session | null = null;
  do {
    session = await getSession();
    if (session?.user?.id) return session;
    if (maxMs <= 0) break;
    await new Promise((r) => setTimeout(r, 250));
  } while (Date.now() < deadline);
  return session;
}
