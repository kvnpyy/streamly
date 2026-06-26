import {
  isReviewPanelCreds,
  isReviewPanelEnabled,
} from "@/lib/review-panel/credentials";
import { reviewPanelAction } from "@/lib/review-panel/catalog";

export type ReviewPanelCreds = {
  server: string;
  username: string;
  password: string;
};

export function tryHandleReviewPanelRequest(
  creds: ReviewPanelCreds,
  params: Record<string, string>
): unknown | null {
  if (!isReviewPanelEnabled() || !isReviewPanelCreds(creds)) {
    return null;
  }
  const action = params.action ?? null;
  return reviewPanelAction(action, params, creds);
}
