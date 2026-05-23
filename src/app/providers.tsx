"use client";

import { AuthSessionBootstrap } from "@/components/AuthSessionBootstrap";
import { FavoritesSyncBootstrap } from "@/components/FavoritesSyncBootstrap";
import { CookieConsentBar } from "@/components/CookieConsentBar";
import { TvBrowserProvider } from "@/components/TvBrowserProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
            retry: 1,
          },
        },
      })
  );
  return (
    <SessionProvider>
      <AuthSessionBootstrap>
        <FavoritesSyncBootstrap>
          <TvBrowserProvider>
            <QueryClientProvider client={client}>
              {children}
              <CookieConsentBar />
            </QueryClientProvider>
          </TvBrowserProvider>
        </FavoritesSyncBootstrap>
      </AuthSessionBootstrap>
    </SessionProvider>
  );
}
