import { BlogShell } from "@/components/blog/BlogShell";
import { getBlogPost, getBlogSlugs } from "@/lib/blog/registry";
import { absoluteSiteUrl, SITE_NAME } from "@/lib/site-brand";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  return getBlogSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Post not found" };

  const url = absoluteSiteUrl(`/blog/${slug}`);
  const locale = post.locale ?? "en";
  return {
    title: post.title,
    description: post.description,
    keywords: post.keywords,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url,
      locale: locale === "pt-BR" ? "pt_BR" : locale,
      publishedTime: post.publishedAt,
      modifiedTime: post.updatedAt ?? post.publishedAt,
      siteName: SITE_NAME,
    },
    twitter: {
      card: "summary_large_image",
      title: post.title,
      description: post.description,
    },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const { Component } = post;
  const locale = post.locale ?? "en";
  const dateLocale = locale === "pt-BR" ? "pt-BR" : "en-US";
  const readingLabel =
    locale === "pt-BR"
      ? `${post.readingMinutes} min de leitura`
      : `${post.readingMinutes} min read`;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified: post.updatedAt ?? post.publishedAt,
    inLanguage: locale,
    author: {
      "@type": "Person",
      name: "Streamly maintainer",
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteSiteUrl("/"),
    },
    mainEntityOfPage: absoluteSiteUrl(`/blog/${slug}`),
  };

  return (
    <BlogShell backHref="/blog" backLabel="All posts">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <header
        className="space-y-4 mb-10 pb-8 border-b border-white/10"
        lang={locale}
      >
        <Link
          href="/blog"
          className="text-sm text-(--text-muted) hover:text-(--text)"
        >
          ← Blog
        </Link>
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-(--text) leading-tight">
          {post.title}
        </h1>
        <p className="text-sm text-(--text-muted)">
          <time dateTime={post.publishedAt}>
            {new Date(post.publishedAt).toLocaleDateString(dateLocale, {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
          {" · "}
          {readingLabel}
        </p>
      </header>
      <div lang={locale}>
        <Component />
      </div>
    </BlogShell>
  );
}
