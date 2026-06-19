import { TvInstallLanding } from "@/components/landing/TvInstallLanding";
import { TV_INSTALL_LEAD } from "@/lib/tv-install-guide";
import { absoluteSiteUrl, SITE_NAME } from "@/lib/site-brand";
import type { Metadata } from "next";

const title = `Smart TV Setup | ${SITE_NAME}`;
const description = `${TV_INSTALL_LEAD} Step-by-step guides for Samsung, LG, Fire TV, and Android TV.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/tv" },
  openGraph: {
    type: "website",
    title,
    description,
    url: absoluteSiteUrl("/tv"),
    siteName: SITE_NAME,
    locale: "en",
  },
  twitter: {
    card: "summary",
    title,
    description,
  },
};

export default function TvSetupPage() {
  return <TvInstallLanding />;
}
