import {
  HowToSelfHostStreamlyContent,
  meta as selfHostMeta,
} from "@/content/blog/how-to-self-host-streamly";
import {
  XtreamCodesVsM3UContent,
  meta as xtreamMeta,
} from "@/content/blog/xtream-codes-vs-m3u";
import type { BlogPost } from "@/lib/blog/types";

const posts: BlogPost[] = [
  { ...selfHostMeta, Component: HowToSelfHostStreamlyContent },
  { ...xtreamMeta, Component: XtreamCodesVsM3UContent },
];

export function getAllBlogPosts(): BlogPost[] {
  return [...posts].sort(
    (a, b) =>
      new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime()
  );
}

export function getBlogPost(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getBlogSlugs(): string[] {
  return posts.map((p) => p.slug);
}
