import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { STREAM_SILK_HEADER, STREAM_TV_HEADER } from "@/lib/tv-user-agent";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import {
  DEFAULT_SITE_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  siteMetadataBase,
} from "@/lib/site-brand";
import { cn } from "@/lib/utils";
import { headers } from "next/headers";
import Script from "next/script";
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
    default: `${SITE_NAME} — IPTV player for Xtream & playlists`,
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "IPTV player",
    "Xtream Codes",
    "browser TV",
    "M3U player",
    "live TV web",
  ],
  authors: [{ name: SITE_NAME }],
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  alternates: metadataBase ? { canonical: "/" } : undefined,
  robots: { index: true, follow: true },
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
  const skipRemoteFonts = tvServerHint || silkHint;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
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
        <GoogleAnalytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
