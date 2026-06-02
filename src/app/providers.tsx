"use client";

import { AuthSessionBootstrap } from "@/components/AuthSessionBootstrap";
import { CatalogPrefetch } from "@/components/CatalogPrefetch";
import { ChunkLoadRecovery } from "@/components/ChunkLoadRecovery";
import { FavoritesSyncBootstrap } from "@/components/FavoritesSyncBootstrap";
import { PrefsRehydrateBootstrap } from "@/components/PrefsRehydrateBootstrap";
import { CookieConsentBar } from "@/components/CookieConsentBar";
import { LivingRoomBootstrap } from "@/components/LivingRoomBootstrap";
import { TvBrowserProvider } from "@/components/TvBrowserProvider";
import { PerformanceHud } from "@/components/PerformanceHud";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { SessionProvider } from "next-auth/react";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            gcTime: 1000 * 60 * 30,
            refetchOnWindowFocus: false,
            /** Large IPTV arrays — deep compare on every notify causes multi‑ms jank. */
            structuralSharing: false,
            retry: (failureCount, error) => {
              if (failureCount >= 1) return false;
              const msg =
                error instanceof Error ? error.message : String(error);
              if (
                /\b502\b|Bad Gateway|\b503\b|\b504\b|gateway|timeout/i.test(msg)
              ) {
                return false;
              }
              return true;
            },
          },
        },
      })
  );
  return (
    <SessionProvider>
      <MotionConfig reducedMotion="user">
        <AuthSessionBootstrap>
          <PrefsRehydrateBootstrap>
            <FavoritesSyncBootstrap>
              <TvBrowserProvider>
                <LivingRoomBootstrap />
                <QueryClientProvider client={client}>
                  <ChunkLoadRecovery />
                  <CatalogPrefetch />
                  {children}
                  <CookieConsentBar />
                  <PerformanceHud />
                </QueryClientProvider>
              </TvBrowserProvider>
            </FavoritesSyncBootstrap>
          </PrefsRehydrateBootstrap>
        </AuthSessionBootstrap>
      </MotionConfig>
    </SessionProvider>
  );
}
