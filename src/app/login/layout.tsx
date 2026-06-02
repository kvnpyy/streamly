import type { Metadata } from "next";
import { absoluteSiteUrl, SITE_NAME } from "@/lib/site-brand";

const loginTitle = `Sign in | ${SITE_NAME} IPTV web player`;
const loginDescription = `Sign in to Streamly with your Xtream Codes server or M3U playlist. Live TV, movies, and series in your browser. Bring your own subscription.`;

export const metadata: Metadata = {
  title: loginTitle,
  description: loginDescription,
  keywords: [
    "IPTV web player sign in",
    "Xtream Codes web player",
    "M3U web player login",
    SITE_NAME,
  ],
  alternates: { canonical: "/login" },
  openGraph: {
    title: loginTitle,
    description: loginDescription,
    type: "website",
    url: absoluteSiteUrl("/login"),
    siteName: SITE_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: loginTitle,
    description: loginDescription,
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
