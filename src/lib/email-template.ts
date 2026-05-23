import { SITE_NAME, SITE_TAGLINE, absoluteSiteUrl } from "@/lib/site-brand";

/** Matches app `globals.css` — tuned for email client contrast. */
export const EMAIL_BRAND = {
  bg0: "#06070b",
  bg1: "#0b0d14",
  bg2: "#11141c",
  bg3: "#181c27",
  line: "#262b3a",
  text: "#eef0f6",
  textDim: "#9aa0b3",
  textMuted: "#6b7180",
  brand: "#7c5cff",
  brandDeep: "#5b3fd4",
  brand2: "#00e0c6",
  danger: "#ff5470",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type StreamlyEmailCta = {
  label: string;
  href: string;
  /** Primary = gradient pill; secondary = outline. */
  variant?: "primary" | "secondary";
};

export type StreamlyEmailFeature = {
  title: string;
  body: string;
};

export type RenderStreamlyEmailOptions = {
  /** Inbox preview line (hidden in body). */
  preheader: string;
  headline: string;
  /** HTML paragraphs — use `<p>...</p>`; user strings must be escaped first. */
  bodyHtml: string;
  ctas?: StreamlyEmailCta[];
  features?: StreamlyEmailFeature[];
  /** Small print above footer links. */
  footnote?: string;
  /** Extra footer HTML (e.g. unsubscribe). User URLs must be trusted. */
  footerExtraHtml?: string;
};

function renderCtaButton(cta: StreamlyEmailCta): string {
  const primary = cta.variant !== "secondary";
  if (primary) {
    return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0">
  <tr>
    <td align="center" style="border-radius:12px;background:linear-gradient(135deg,${EMAIL_BRAND.brand} 0%,${EMAIL_BRAND.brandDeep} 100%);box-shadow:0 8px 28px rgba(124,92,255,0.35)">
      <a href="${cta.href}" target="_blank" style="display:inline-block;padding:14px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;line-height:1.2;border-radius:12px">
        ${escapeHtml(cta.label)}
      </a>
    </td>
  </tr>
</table>`.trim();
  }
  return `
<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 12px 0">
  <tr>
    <td align="center" style="border-radius:12px;border:1px solid ${EMAIL_BRAND.line};background:${EMAIL_BRAND.bg2}">
      <a href="${cta.href}" target="_blank" style="display:inline-block;padding:12px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:${EMAIL_BRAND.brand2};text-decoration:none;line-height:1.2">
        ${escapeHtml(cta.label)}
      </a>
    </td>
  </tr>
</table>`.trim();
}

function renderFeatures(features: StreamlyEmailFeature[]): string {
  const rows = features
    .map(
      (f) => `
<tr>
  <td width="28" valign="top" style="padding:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:18px;line-height:1">
    <span style="display:inline-block;width:22px;height:22px;border-radius:6px;background:linear-gradient(135deg,${EMAIL_BRAND.brand}33,${EMAIL_BRAND.brand2}22);text-align:center;line-height:22px;font-size:11px;color:${EMAIL_BRAND.brand2}">&#10003;</span>
  </td>
  <td valign="top" style="padding:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <div style="font-size:14px;font-weight:600;color:${EMAIL_BRAND.text};margin:0 0 4px 0">${escapeHtml(f.title)}</div>
    <div style="font-size:13px;line-height:1.5;color:${EMAIL_BRAND.textDim};margin:0">${escapeHtml(f.body)}</div>
  </td>
</tr>`
    )
    .join("");
  return `
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 20px 0">
  ${rows}
</table>`.trim();
}

function renderHeader(): string {
  const home = absoluteSiteUrl("/");
  return `
<tr>
  <td style="padding:28px 32px 24px 32px;background:linear-gradient(165deg,${EMAIL_BRAND.bg1} 0%,${EMAIL_BRAND.bg0} 100%);border-bottom:1px solid ${EMAIL_BRAND.line}">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
      <tr>
        <td width="48" valign="middle" style="padding:0 14px 0 0">
          <div style="width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,${EMAIL_BRAND.brand} 0%,${EMAIL_BRAND.brand2} 100%);text-align:center;line-height:44px;box-shadow:0 8px 24px rgba(124,92,255,0.4)">
            <span style="font-size:16px;color:#ffffff">&#9654;</span>
          </div>
        </td>
        <td valign="middle">
          <a href="${home}" style="text-decoration:none">
            <span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:20px;font-weight:700;letter-spacing:-0.02em;color:${EMAIL_BRAND.text}">${escapeHtml(SITE_NAME)}</span>
          </a>
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${EMAIL_BRAND.textMuted};margin-top:4px;line-height:1.4">${escapeHtml(SITE_TAGLINE)}</div>
        </td>
      </tr>
    </table>
  </td>
</tr>`.trim();
}

function renderFooter(footnote?: string, footerExtraHtml?: string): string {
  const home = absoluteSiteUrl("/");
  const privacy = absoluteSiteUrl("/legal/privacy");
  const terms = absoluteSiteUrl("/legal/terms");
  const year = new Date().getFullYear();

  const noteBlock = footnote
    ? `<p style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.55;color:${EMAIL_BRAND.textMuted}">${escapeHtml(footnote)}</p>`
    : "";

  const extra = footerExtraHtml ? `<div style="margin-top:12px">${footerExtraHtml}</div>` : "";

  return `
<tr>
  <td style="padding:24px 32px 32px 32px;background:${EMAIL_BRAND.bg0};border-top:1px solid ${EMAIL_BRAND.line}">
    ${noteBlock}
    <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:${EMAIL_BRAND.textMuted}">
      <a href="${home}" style="color:${EMAIL_BRAND.textDim};text-decoration:underline">${escapeHtml(SITE_NAME)}</a>
      &nbsp;&middot;&nbsp;
      <a href="${privacy}" style="color:${EMAIL_BRAND.textDim};text-decoration:underline">Privacy</a>
      &nbsp;&middot;&nbsp;
      <a href="${terms}" style="color:${EMAIL_BRAND.textDim};text-decoration:underline">Terms</a>
    </p>
    <p style="margin:10px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${EMAIL_BRAND.textMuted}">
      &copy; ${year} ${escapeHtml(SITE_NAME)}. You received this because of activity on your account.
    </p>
    ${extra}
  </td>
</tr>`.trim();
}

/** Table-based HTML email shell — dark glass aesthetic aligned with the web app. */
export function renderStreamlyEmail(opts: RenderStreamlyEmailOptions): string {
  const preheader = escapeHtml(opts.preheader);
  const headline = escapeHtml(opts.headline);
  const ctas = (opts.ctas ?? []).map(renderCtaButton).join("\n");
  const features = opts.features?.length ? renderFeatures(opts.features) : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <title>${headline}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style>
    @media (prefers-color-scheme: dark) {
      .email-bg { background-color: ${EMAIL_BRAND.bg0} !important; }
    }
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-pad { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body class="email-bg" style="margin:0;padding:0;background-color:${EMAIL_BRAND.bg0};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${EMAIL_BRAND.bg0};opacity:0">
    ${preheader}${"&nbsp;".repeat(80)}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${EMAIL_BRAND.bg0};background-image:radial-gradient(600px 300px at 90% -20%, rgba(124,92,255,0.12), transparent), radial-gradient(500px 280px at -10% 30%, rgba(0,224,198,0.06), transparent)">
    <tr>
      <td align="center" style="padding:32px 16px">
        <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;border-collapse:separate;border-radius:16px;overflow:hidden;border:1px solid ${EMAIL_BRAND.line};box-shadow:0 24px 64px rgba(0,0,0,0.45)">
          ${renderHeader()}
          <tr>
            <td class="email-pad" style="padding:32px 32px 8px 32px;background:${EMAIL_BRAND.bg1}">
              <h1 style="margin:0 0 16px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.03em;line-height:1.25;color:${EMAIL_BRAND.text}">
                ${headline}
              </h1>
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:${EMAIL_BRAND.textDim}">
                ${opts.bodyHtml}
              </div>
              ${features}
              ${ctas ? `<div style="margin-top:24px">${ctas}</div>` : ""}
            </td>
          </tr>
          ${renderFooter(opts.footnote, opts.footerExtraHtml)}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Styled paragraph for email bodies. */
export function emailParagraph(html: string): string {
  return `<p style="margin:0 0 14px 0">${html}</p>`;
}
