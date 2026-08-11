export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  /** ISO date */
  updatedAt?: string;
  readingMinutes: number;
  keywords: string[];
  /** BCP 47 locale for article lang / dates (e.g. pt-BR). Defaults to en. */
  locale?: string;
};

import type { ReactElement } from "react";

export type BlogPost = BlogPostMeta & {
  Component: () => ReactElement;
};
