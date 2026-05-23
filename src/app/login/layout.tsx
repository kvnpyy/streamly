import type { Metadata } from "next";
import { SITE_DESCRIPTION, SITE_NAME } from "@/lib/site-brand";

export const metadata: Metadata = {
  title: `Sign in — ${SITE_NAME}`,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: `Sign in — ${SITE_NAME}`,
    description: SITE_DESCRIPTION,
    type: "website",
  },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
