import { BlogShell } from "@/components/blog/BlogShell";
import { getAllBlogPosts } from "@/lib/blog/registry";
import { absoluteSiteUrl, SITE_NAME } from "@/lib/site-brand";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "IPTV Web Player Guides & Blog",
  description: `Guides for the ${SITE_NAME} IPTV web player: self-hosting, Xtream Codes vs M3U, Docker setup, and browser IPTV in 2026.`,
  keywords: [
    "IPTV web player",
    "Xtream Codes",
    "M3U playlist",
    "self-hosted IPTV",
    SITE_NAME,
  ],
  alternates: { canonical: "/blog" },
  openGraph: {
    title: `${SITE_NAME} — IPTV web player guides`,
    description: `Self-hosted IPTV web player guides, Xtream vs M3U, and Docker setup notes.`,
    url: absoluteSiteUrl("/blog"),
  },
};

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();

  return (
    <BlogShell backHref="/" backLabel="Home">
      <div className="space-y-10">
        <header className="space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-(--brand-2)">
            Blog
          </p>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-(--text)">
            Streamly notes
          </h1>
          <p className="text-(--text-muted) max-w-xl">
            Practical write-ups on self-hosting, playlist formats, and building a
            calm IPTV web player — from the person who actually maintains the
            code.
          </p>
        </header>

        <ul className="space-y-6">
          {posts.map((post) => (
            <li key={post.slug}>
              <article className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:border-white/18 transition-colors">
                <time
                  dateTime={post.publishedAt}
                  className="text-xs text-(--text-muted)"
                >
                  {new Date(post.publishedAt).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  {" · "}
                  {post.readingMinutes} min read
                </time>
                <h2 className="mt-2 text-xl font-semibold text-(--text)">
                  <Link
                    href={`/blog/${post.slug}`}
                    className="hover:text-(--brand-2) transition-colors"
                  >
                    {post.title}
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-(--text-dim) leading-relaxed">
                  {post.description}
                </p>
                <Link
                  href={`/blog/${post.slug}`}
                  className="inline-block mt-4 text-sm font-medium text-(--brand-2) hover:underline underline-offset-2"
                >
                  Read post →
                </Link>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </BlogShell>
  );
}
