import "server-only";

import {
  AUTH_PURPOSE_EMAIL_VERIFY,
  replaceAuthToken,
} from "@/lib/auth-tokens";
import { emailParagraph, escapeHtml, renderStreamlyEmail } from "@/lib/email-template";
import { sendTransactionalEmail } from "@/lib/mail";
import { SITE_NAME, absoluteSiteUrl } from "@/lib/site-brand";

const VERIFY_TTL_MS = 48 * 60 * 60 * 1000;

export type IssueTransactionalMailResult =
  | { ok: true }
  | { ok: false; reason: "missing_config" | "upstream" };

export async function issueEmailVerification(
  userId: string,
  email: string
): Promise<IssueTransactionalMailResult> {
  const token = await replaceAuthToken({
    userId,
    purpose: AUTH_PURPOSE_EMAIL_VERIFY,
    ttlMs: VERIFY_TTL_MS,
  });
  const link = absoluteSiteUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  const subject = `Confirm your ${SITE_NAME} email`;
  const text = `Open this link to confirm your email (expires in 48 hours):\n\n${link}\n\nIf you did not create an account, you can ignore this message.`;

  const html = renderStreamlyEmail({
    preheader: `Confirm your ${SITE_NAME} email to finish creating your account.`,
    headline: "Confirm your email",
    bodyHtml: [
      emailParagraph(
        `Thanks for signing up. Tap the button below to verify <strong style="color:#eef0f6">${escapeHtml(email)}</strong> and unlock your ${escapeHtml(SITE_NAME)} account.`
      ),
      emailParagraph(
        "Once confirmed, you can save IPTV providers encrypted on the server and pick up where you left off on any device."
      ),
    ].join(""),
    ctas: [
      {
        label: "Verify email address",
        href: link,
        variant: "primary",
      },
    ],
    footnote:
      "This link expires in 48 hours. If you didn't create an account, you can safely ignore this email.",
  });

  const sent = await sendTransactionalEmail({ to: email, subject, text, html });
  if (!sent.ok) return { ok: false, reason: sent.reason };
  return { ok: true };
}
