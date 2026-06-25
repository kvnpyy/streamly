import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  STREAM_SAMSUNG_TV_HEADER,
  STREAM_SILK_HEADER,
  STREAM_TV_HEADER,
} from "@/lib/tv-user-agent";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import {
  SITE_SEO_DESCRIPTION,
  SITE_SEO_KEYWORDS,
  SITE_SEO_TITLE,
} from "@/lib/seo-landing";
import {
  DEFAULT_SITE_URL,
  SITE_NAME,
  siteMetadataBase,
} from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import { headers } from "next/headers";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
  adjustFontFallback: true,
  preload: false,
});

const metadataBase = siteMetadataBase();

export const metadata: Metadata = {
  metadataBase: metadataBase ?? undefined,
  title: {
    default: SITE_SEO_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_SEO_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [...SITE_SEO_KEYWORDS],
  authors: [{ name: SITE_NAME }],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_SEO_TITLE,
    description: SITE_SEO_DESCRIPTION,
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_SEO_TITLE,
    description: SITE_SEO_DESCRIPTION,
  },
  robots: { index: true, follow: true },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [{ url: "/icon", type: "image/png" }],
    apple: [{ url: "/apple-icon", type: "image/png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#06070b",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const h = await headers();
  const tvServerHint = h.get(STREAM_TV_HEADER) === "1";
  const silkHint = h.get(STREAM_SILK_HEADER) === "1";
  const samsungTvHint = h.get(STREAM_SAMSUNG_TV_HEADER) === "1";
  const skipRemoteFonts = tvServerHint || silkHint;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    alternateName: ["IPTV Web Player", "iptvwebplayer"],
    description: SITE_SEO_DESCRIPTION,
    url: metadataBase?.origin ?? DEFAULT_SITE_URL,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased",
        tvServerHint && "tv-server-hint",
        silkHint && "stream-silk-hint",
        samsungTvHint && "samsung-tv-hint",
        !skipRemoteFonts && geistSans.variable,
        !skipRemoteFonts && geistMono.variable
      )}
    >
      <body
        className="min-h-full"
        style={{
          backgroundColor: "#06070b",
          color: "#eef0f6",
        }}
      >
        {/*
          React 19 rejects raw <script> in the tree (client render warning). Static file +
          next/script in <body> keeps load order early via beforeInteractive.
          See public/ethereum-provider-noop.js (Safari / sloppy wallet-extension snippets).
        */}
        <Script
          id="ethereum-provider-noop"
          src="/ethereum-provider-noop.js"
          strategy="beforeInteractive"
        />
        <Script
          id="streamly-jsonld"
          type="application/ld+json"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <Suspense fallback={null}>
          <GoogleAnalytics />
        </Suspense>
        <Providers tvServerHint={tvServerHint} silkHint={silkHint}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
