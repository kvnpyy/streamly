"use client";

import { gaMeasurementId } from "@/lib/analytics";
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  cookieConsentAllowsAnalytics,
  isCookieConsentBannerEnabled,
} from "@/lib/cookie-consent";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function sendGaPageView(measurementId: string, pagePath: string) {
  window.gtag?.("event", "page_view", {
    send_to: measurementId,
    page_path: pagePath,
  });
}

export function GoogleAnalytics() {
  const id = gaMeasurementId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [allowScripts, setAllowScripts] = useState(false);

  useEffect(() => {
    if (!id) return;

    const sync = () => {
      if (!isCookieConsentBannerEnabled()) {
        setAllowScripts(true);
        return;
      }
      setAllowScripts(cookieConsentAllowsAnalytics());
    };

    sync();
    window.addEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
    return () => window.removeEventListener(COOKIE_CONSENT_CHANGED_EVENT, sync);
  }, [id]);

  useEffect(() => {
    if (!id || !allowScripts || !pathname) return;
    const query = searchParams?.toString();
    const pagePath = query ? `${pathname}?${query}` : pathname;
    sendGaPageView(id, pagePath);
  }, [allowScripts, id, pathname, searchParams]);

  if (!id || !allowScripts) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`}
        strategy="afterInteractive"
      />
      <Script id="ga-gtag-init" strategy="afterInteractive">
        {`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}', { send_page_view: false });
        `.trim()}
      </Script>
    </>
  );
}
