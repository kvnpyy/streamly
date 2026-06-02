export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  /** ISO date */
  updatedAt?: string;
  readingMinutes: number;
  keywords: string[];
};

import type { ReactElement } from "react";

export type BlogPost = BlogPostMeta & {
  Component: () => ReactElement;
};
