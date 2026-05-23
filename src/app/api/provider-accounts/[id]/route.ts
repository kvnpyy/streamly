import { auth } from "@/auth";
import { getDb } from "@/db";
import { iptvProviderAccounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const label = (body as { label?: string }).label;
  if (typeof label !== "string" || !label.trim()) {
    return NextResponse.json({ error: "Invalid label" }, { status: 400 });
  }

  const rows = await getDb()
    .update(iptvProviderAccounts)
    .set({ label: label.trim().slice(0, 120), updatedAt: new Date() })
    .where(
      and(eq(iptvProviderAccounts.id, id), eq(iptvProviderAccounts.userId, uid))
    )
    .returning({ id: iptvProviderAccounts.id });

  if (!rows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const session = await auth();
  const uid = session?.user?.id;
  if (!uid) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const rows = await getDb()
    .delete(iptvProviderAccounts)
    .where(
      and(eq(iptvProviderAccounts.id, id), eq(iptvProviderAccounts.userId, uid))
    )
    .returning({ id: iptvProviderAccounts.id });

  if (!rows.length) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
