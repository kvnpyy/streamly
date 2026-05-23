import { FEEDBACK_FORM_URL } from "@/lib/site-brand";

export type FeedbackSurface = "sidebar" | "mobile_sheet" | "settings";

/**
 * Appends UTM + coarse context so Typeform (or GA on the form) can segment responses.
 * Add matching **hidden fields** in Typeform if you want `source_path` / `tv` as columns.
 */
export function feedbackFormUrlWithContext(opts: {
  surface: FeedbackSurface;
  pathname: string;
  tvBrowser?: boolean;
}): string {
  let u: URL;
  try {
    u = new URL(FEEDBACK_FORM_URL);
  } catch {
    return FEEDBACK_FORM_URL;
  }
  u.searchParams.set("utm_source", "streamly");
  u.searchParams.set("utm_medium", opts.surface);
  u.searchParams.set("utm_campaign", "in_app_feedback");
  const path = opts.pathname.replace(/\/+$/, "") || "/";
  u.searchParams.set("source_path", path.slice(0, 200));
  if (opts.tvBrowser) u.searchParams.set("tv", "1");
  return u.toString();
}
