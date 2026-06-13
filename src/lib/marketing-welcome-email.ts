import "server-only";

import {
  EMAIL_BRAND,
  emailParagraph,
  escapeHtml,
  renderStreamlyEmail,
} from "@/lib/email-template";
import { sendTransactionalEmail } from "@/lib/mail";
import {
  createMarketingUnsubscribeToken,
  marketingUnsubscribeUrl,
} from "@/lib/marketing-unsubscribe-token";
import { SITE_NAME, absoluteSiteUrl, discordInviteUrl } from "@/lib/site-brand";

export type SendWelcomeEmailResult =
  | { ok: true }
  | { ok: false; reason: "missing_config" | "upstream" };

/** Product onboarding email — sent once after verified opt-in. */
export async function sendMarketingWelcomeEmail(opts: {
  userId: string;
  email: string;
  name?: string | null;
}): Promise<SendWelcomeEmailResult> {
  const greetName = opts.name?.trim();
  const greet = greetName ? escapeHtml(greetName) : "there";
  const appUrl = absoluteSiteUrl("/app");
  const settingsUrl = absoluteSiteUrl("/app/settings");
  const discordUrl = discordInviteUrl();

  const unsubToken = createMarketingUnsubscribeToken(opts.userId);
  const unsubLine = unsubToken
    ? `\n\nUnsubscribe from product updates: ${marketingUnsubscribeUrl(unsubToken)}`
    : "";

  const subject = `Welcome to ${SITE_NAME}`;
  const text = `${greetName ? `Hi ${greetName},` : "Hi there,"}

Thanks for confirming your email. ${SITE_NAME} is ready when you are — open your library, add an IPTV provider in Settings, and start watching live TV, movies, and series in one place.

Open ${SITE_NAME}: ${appUrl}
Settings (saved providers): ${settingsUrl}${discordUrl ? `\nJoin the community: ${discordUrl}` : ""}

We'll only send occasional product tips and launch news because you opted in. Transactional messages (password reset, security) may still arrive separately.${unsubLine}`;

  const unsubHtml = unsubToken
    ? `<p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${EMAIL_BRAND.textMuted}">
        <a href="${marketingUnsubscribeUrl(unsubToken)}" style="color:${EMAIL_BRAND.brand2};text-decoration:underline">Unsubscribe</a> from product updates.
      </p>`
    : "";

  const html = renderStreamlyEmail({
    preheader: `You're in — live TV, movies, and series in one calm ${SITE_NAME} player.`,
    headline: `Welcome to ${SITE_NAME}`,
    bodyHtml: [
      emailParagraph(`Hi <strong style="color:#eef0f6">${greet}</strong>,`),
      emailParagraph(
        `Thanks for confirming your email and opting in to hear from us. Your playlist deserves a player that stays out of the way — here's how to get the most from ${escapeHtml(SITE_NAME)}.`
      ),
    ].join(""),
    features: [
      {
        title: "Add your IPTV provider",
        body: "Paste Xtream credentials or an M3U URL in Settings — we encrypt saved accounts on the server.",
      },
      {
        title: "Browse live, movies, and series",
        body: "Fast catalogs, EPG, favorites, and a player built for couch and desktop.",
      },
      {
        title: "Pick up on any device",
        body: "Sign in with your Streamly account so providers sync wherever you watch.",
      },
      ...(discordUrl
        ? [
            {
              title: "Join the community",
              body: "Chat with other users, get setup help, and hear about releases on Discord.",
            },
          ]
        : []),
    ],
    ctas: [
      { label: `Open ${SITE_NAME}`, href: appUrl, variant: "primary" as const },
      { label: "Account settings", href: settingsUrl, variant: "secondary" as const },
      ...(discordUrl
        ? [{ label: "Join Discord", href: discordUrl, variant: "secondary" as const }]
        : []),
    ],
    footnote:
      "You opted in to occasional product tips and launch news. Password resets and security emails are separate.",
    footerExtraHtml: unsubHtml,
  });

  const sent = await sendTransactionalEmail({
    to: opts.email,
    subject,
    text,
    html,
  });
  if (!sent.ok) return { ok: false, reason: sent.reason };
  return { ok: true };
}
