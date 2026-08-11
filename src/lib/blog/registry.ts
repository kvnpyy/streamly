import {
  BestIptvWebPlayerXtreamCodes2026Content,
  meta as bestPlayerMeta,
} from "@/content/blog/best-iptv-web-player-xtream-codes-2026";
import {
  ComoUsarStreamlyXtreamM3uContent,
  meta as comoUsarMeta,
} from "@/content/blog/como-usar-streamly-xtream-m3u";
import {
  HowToSelfHostStreamlyContent,
  meta as selfHostMeta,
} from "@/content/blog/how-to-self-host-streamly";
import {
  HowToUseIptvWebPlayerContent,
  meta as howToUseMeta,
} from "@/content/blog/how-to-use-iptv-web-player";
import {
  NextjsIptvWeekendBuildContent,
  meta as weekendBuildMeta,
} from "@/content/blog/nextjs-iptv-weekend-build";
import {
  StreamlyFiveDollarVpsContent,
  meta as fiveDollarVpsMeta,
} from "@/content/blog/streamly-five-dollar-vps";
import {
  XtreamCodesVsM3UContent,
  meta as xtreamMeta,
} from "@/content/blog/xtream-codes-vs-m3u";
import type { BlogPost } from "@/lib/blog/types";

const posts: BlogPost[] = [
  { ...bestPlayerMeta, Component: BestIptvWebPlayerXtreamCodes2026Content },
  { ...howToUseMeta, Component: HowToUseIptvWebPlayerContent },
  { ...comoUsarMeta, Component: ComoUsarStreamlyXtreamM3uContent },
  { ...weekendBuildMeta, Component: NextjsIptvWeekendBuildContent },
  { ...fiveDollarVpsMeta, Component: StreamlyFiveDollarVpsContent },
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

/** For README / marketing — metadata only, no React component. */
export function getBlogGuideSummaries(): Pick<
  BlogPost,
  "slug" | "title" | "description" | "publishedAt" | "readingMinutes"
>[] {
  return getAllBlogPosts().map(({ slug, title, description, publishedAt, readingMinutes }) => ({
    slug,
    title,
    description,
    publishedAt,
    readingMinutes,
  }));
}
