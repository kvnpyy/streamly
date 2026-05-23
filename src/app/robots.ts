import type { MetadataRoute } from "next";
import { siteMetadataBase } from "@/lib/site-brand";

export default function robots(): MetadataRoute.Robots {
  const base = siteMetadataBase();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/"],
    },
    sitemap: base ? `${base.origin}/sitemap.xml` : undefined,
  };
}
