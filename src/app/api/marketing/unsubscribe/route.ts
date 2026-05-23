import { verifyMarketingUnsubscribeToken } from "@/lib/marketing-unsubscribe-token";
import { unsubscribeUserFromMarketing } from "@/lib/marketing-unsubscribe-user";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/** One-click unsubscribe from product-update emails (signed link). */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = (body as { token?: string }).token;
  if (typeof token !== "string" || !token.trim()) {
    return NextResponse.json({ error: "Token is required." }, { status: 400 });
  }

  const userId = verifyMarketingUnsubscribeToken(token.trim());
  if (!userId) {
    return NextResponse.json(
      { error: "Invalid or expired unsubscribe link." },
      { status: 400 }
    );
  }

  const result = await unsubscribeUserFromMarketing(userId);
  if (!result) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true, email: result.email });
}
