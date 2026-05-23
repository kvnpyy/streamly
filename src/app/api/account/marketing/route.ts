import { auth } from "@/auth";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { userEligibleForMarketingEmail } from "@/lib/marketing-eligibility";
import {
  markMarketingContactUnsubscribedInResend,
  syncMarketingContactToResend,
} from "@/lib/marketing-resend";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await getDb()
    .select({
      marketingOptIn: users.marketingOptIn,
      marketingUnsubscribedAt: users.marketingUnsubscribedAt,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);
  const row = rows[0];
  if (!row) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({
    marketingOptIn: row.marketingOptIn === true,
    subscribed: userEligibleForMarketingEmail(row),
    emailVerified: row.emailVerifiedAt != null,
    unsubscribedAt: row.marketingUnsubscribedAt?.toISOString() ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const marketingOptIn = (body as { marketingOptIn?: boolean }).marketingOptIn;
  if (typeof marketingOptIn !== "boolean") {
    return NextResponse.json(
      { error: "marketingOptIn (boolean) is required." },
      { status: 400 }
    );
  }

  const rows = await getDb()
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);
  const user = rows[0];
  if (!user) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const now = new Date();

  if (marketingOptIn) {
    await getDb()
      .update(users)
      .set({
        marketingOptIn: true,
        marketingOptInAt: now,
        marketingUnsubscribedAt: null,
      })
      .where(eq(users.id, uid));

    if (user.emailVerifiedAt != null) {
      const sync = await syncMarketingContactToResend({
        email: user.email,
        firstName: user.name,
        unsubscribed: false,
      });
      if (!sync.ok) {
        console.warn("[marketing:settings] resend sync", sync.reason, user.email);
      }
    }
  } else {
    await getDb()
      .update(users)
      .set({
        marketingOptIn: false,
        marketingUnsubscribedAt: now,
      })
      .where(eq(users.id, uid));

    const sync = await markMarketingContactUnsubscribedInResend(user.email);
    if (!sync.ok) {
      console.warn("[marketing:settings] resend unsub", sync.reason, user.email);
    }
  }

  const updated = await getDb()
    .select({
      marketingOptIn: users.marketingOptIn,
      marketingUnsubscribedAt: users.marketingUnsubscribedAt,
      emailVerifiedAt: users.emailVerifiedAt,
    })
    .from(users)
    .where(eq(users.id, uid))
    .limit(1);

  const row = updated[0]!;
  return NextResponse.json({
    marketingOptIn: row.marketingOptIn === true,
    subscribed: userEligibleForMarketingEmail(row),
    emailVerified: row.emailVerifiedAt != null,
    unsubscribedAt: row.marketingUnsubscribedAt?.toISOString() ?? null,
  });
}
