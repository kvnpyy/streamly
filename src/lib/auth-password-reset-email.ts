import "server-only";

import {
  AUTH_PURPOSE_PASSWORD_RESET,
  replaceAuthToken,
} from "@/lib/auth-tokens";
import { emailParagraph, escapeHtml, renderStreamlyEmail } from "@/lib/email-template";
import type { IssueTransactionalMailResult } from "@/lib/auth-verification-email";
import { sendTransactionalEmail } from "@/lib/mail";
import { SITE_NAME, absoluteSiteUrl } from "@/lib/site-brand";

const RESET_TTL_MS = 60 * 60 * 1000;

export async function issuePasswordResetEmail(
  userId: string,
  email: string
): Promise<IssueTransactionalMailResult> {
  const token = await replaceAuthToken({
    userId,
    purpose: AUTH_PURPOSE_PASSWORD_RESET,
    ttlMs: RESET_TTL_MS,
  });
  const link = absoluteSiteUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  const subject = `${SITE_NAME} password reset`;
  const text = `We received a request to reset your password. Open this link within one hour:\n\n${link}\n\nIf you did not ask for this, you can ignore this message.`;

  const html = renderStreamlyEmail({
    preheader: `Reset your ${SITE_NAME} password — link valid for one hour.`,
    headline: "Reset your password",
    bodyHtml: [
      emailParagraph(
        `We received a request to reset the password for <strong style="color:#eef0f6">${escapeHtml(email)}</strong>.`
      ),
      emailParagraph(
        "Choose a new password with the button below. For your security, this link only works once and expires soon."
      ),
    ].join(""),
    ctas: [
      {
        label: "Choose a new password",
        href: link,
        variant: "primary",
      },
    ],
    footnote:
      "This link expires in one hour. If you didn't request a reset, you can safely ignore this email — your password won't change.",
  });

  const sent = await sendTransactionalEmail({ to: email, subject, text, html });
  if (!sent.ok) return { ok: false, reason: sent.reason };
  return { ok: true };
}
