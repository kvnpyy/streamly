import type { MetadataRoute } from "next";
import { DEFAULT_SITE_URL, siteMetadataBase } from "@/lib/site-brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteMetadataBase();
  const origin = base?.origin ?? DEFAULT_SITE_URL.replace(/\/$/, "");
  const last = new Date();
  return [
    { url: `${origin}/`, lastModified: last, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/login`, lastModified: last, changeFrequency: "monthly", priority: 0.9 },
    {
      url: `${origin}/legal/terms`,
      lastModified: last,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${origin}/legal/privacy`,
      lastModified: last,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
