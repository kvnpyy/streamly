"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** TV entry — home hub with discovery (same as /app on living-room clients). */
export default function TvLobbyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app");
  }, [router]);

  return (
    <div className="min-h-[50vh] grid place-items-center">
      <div className="size-10 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin" />
    </div>
  );
}
