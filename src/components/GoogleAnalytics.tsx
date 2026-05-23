"use client";

import { gaMeasurementId } from "@/lib/analytics";
import {
  COOKIE_CONSENT_CHANGED_EVENT,
  cookieConsentAllowsAnalytics,
  isCookieConsentBannerEnabled,
} from "@/lib/cookie-consent";
import Script from "next/script";
import { useEffect, useState } from "react";

export function GoogleAnalytics() {
  const id = gaMeasurementId();
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
gtag('config', '${id}');
        `.trim()}
      </Script>
    </>
  );
}
