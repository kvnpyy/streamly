"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * TV Lobby — redirects straight to Live TV, which is the primary use-case
 * when sitting in front of a TV. The home page already shows the TV Hub
 * dashboard on living-room browsers, so this route avoids duplicating it
 * and instead drops the user directly into the channel guide.
 */
export default function TvLobbyPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/app/live");
  }, [router]);

  return (
    <div className="min-h-[50vh] grid place-items-center">
      <div className="size-10 border-2 border-white/15 border-t-(--brand-2) rounded-full animate-spin" />
    </div>
  );
}
