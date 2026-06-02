import { HomeGateRedirect } from "@/components/landing/HomeGateRedirect";
import { LandingJsonLd } from "@/components/landing/LandingJsonLd";
import { MarketingLanding } from "@/components/landing/MarketingLanding";
import {
  SITE_SEO_DESCRIPTION,
  SITE_SEO_KEYWORDS,
  SITE_SEO_TITLE,
} from "@/lib/seo-landing";
import { absoluteSiteUrl, SITE_NAME } from "@/lib/site-brand";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: SITE_SEO_TITLE,
  description: SITE_SEO_DESCRIPTION,
  keywords: [...SITE_SEO_KEYWORDS],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: SITE_SEO_TITLE,
    description: SITE_SEO_DESCRIPTION,
    url: absoluteSiteUrl("/"),
    siteName: SITE_NAME,
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_SEO_TITLE,
    description: SITE_SEO_DESCRIPTION,
  },
};

export default function HomePage() {
  return (
    <>
      <LandingJsonLd />
      <HomeGateRedirect />
      <MarketingLanding />
    </>
  );
}
