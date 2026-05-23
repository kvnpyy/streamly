import "server-only";

import { SITE_NAME } from "@/lib/site-brand";

export type SendMailResult =
  | { ok: true }
  | { ok: false; reason: "missing_config" | "upstream" };

/** Shown in API error bodies when Resend is not configured (production). */
export const RESEND_ENV_HINT =
  "On the VPS, edit /opt/stream/iptv-player/.env: set RESEND_API_KEY (from resend.com) and EMAIL_FROM. If the from line has spaces or angle brackets, wrap it in double quotes, e.g. EMAIL_FROM=\"Streamly <noreply@yourdomain.com>\". Then run: sudo systemctl restart stream";

/** When Resend returns 4xx/5xx — logs contain [mail:resend] with details. */
export const RESEND_UPSTREAM_HINT =
  "Resend rejected the send (invalid API key, unverified domain, or bad from-address). On the VPS run: journalctl -u stream -n 80 --no-pager | grep mail:resend";


/**
 * Sends a transactional email via [Resend](https://resend.com) when
 * `RESEND_API_KEY` and `EMAIL_FROM` are set. In non-production, missing config
 * logs the body to the server console instead of failing.
 */
export async function sendTransactionalEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<SendMailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const prod = process.env.NODE_ENV === "production";

  if (!apiKey || !from) {
    if (!prod) {
      console.info(`[${SITE_NAME} mail:dev]`, opts.subject, "→", opts.to);
      console.info(opts.text);
      return { ok: true };
    }
    return { ok: false, reason: "missing_config" };
  }

  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[mail:resend]", res.status, body);
    return { ok: false, reason: "upstream" };
  }

  return { ok: true };
}
