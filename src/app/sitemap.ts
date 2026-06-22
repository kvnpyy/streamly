import { getAllBlogPosts } from "@/lib/blog/registry";
import type { MetadataRoute } from "next";
import { DEFAULT_SITE_URL, siteMetadataBase } from "@/lib/site-brand";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteMetadataBase();
  const origin = base?.origin ?? DEFAULT_SITE_URL.replace(/\/$/, "");
  const last = new Date();
  const blogEntries: MetadataRoute.Sitemap = getAllBlogPosts().map((post) => ({
    url: `${origin}/blog/${post.slug}`,
    lastModified: new Date(post.updatedAt ?? post.publishedAt),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  return [
    { url: `${origin}/`, lastModified: last, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/login`, lastModified: last, changeFrequency: "monthly", priority: 0.9 },
    { url: `${origin}/tv`, lastModified: last, changeFrequency: "monthly", priority: 0.85 },
    { url: `${origin}/blog`, lastModified: last, changeFrequency: "weekly", priority: 0.75 },
    ...blogEntries,
    {
      url: `${origin}/changelog`,
      lastModified: last,
      changeFrequency: "weekly",
      priority: 0.65,
    },
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
