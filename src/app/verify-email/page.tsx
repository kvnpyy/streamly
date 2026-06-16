import { BrandMark } from "@/components/BrandMark";
import { SITE_NAME } from "@/lib/site-brand";
import Link from "next/link";
import { VerifyEmailClient } from "./verify-email-client";

function readToken(
  raw: string | string[] | undefined
): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw)) return raw[0]?.trim() ?? "";
  return "";
}

export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const sp = await searchParams;
  const token = readToken(sp.token);

  return (
    <div className="min-h-screen bg-[#06070b] text-[#eef0f6] px-4 py-12">
      <div className="max-w-md mx-auto space-y-6">
        <Link
          href="/login"
          className="text-sm text-(--text-muted) hover:text-(--text) underline underline-offset-2"
        >
          ← Back to sign in
        </Link>
        <div className="flex items-center gap-3">
          <BrandMark size={10} />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Confirm email</h1>
            <p className="text-sm text-(--text-muted) mt-0.5">{SITE_NAME}</p>
          </div>
        </div>
        <VerifyEmailClient token={token} />
      </div>
    </div>
  );
}
