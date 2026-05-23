import type { Metadata } from "next";
import { AppShell } from "@/components/AppShell";
import { SITE_NAME } from "@/lib/site-brand";

export const metadata: Metadata = {
  title: { default: `Library — ${SITE_NAME}`, template: `%s — ${SITE_NAME}` },
  description: `Signed-in area — ${SITE_NAME} IPTV player.`,
  robots: { index: false, follow: false },
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
