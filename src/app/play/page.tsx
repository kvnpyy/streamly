import { StandaloneStreamPlayer } from "@/components/StandaloneStreamPlayer";
import { SITE_NAME } from "@/lib/site-brand";
import type { Metadata } from "next";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: `Play stream — ${SITE_NAME}`,
  robots: { index: false, follow: false },
};

export default function PlayStreamPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen grid place-items-center">
          <div className="size-10 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin" />
        </div>
      }
    >
      <StandaloneStreamPlayer />
    </Suspense>
  );
}
