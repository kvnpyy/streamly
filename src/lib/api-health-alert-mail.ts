import type { ApiHealthFinding } from "@/lib/assess-api-health";
import type { IptvApiErrorMetrics } from "@/lib/iptv-api-error-metrics";

function alertRecipient(): string | null {
  const to =
    process.env.API_HEALTH_ALERT_EMAIL?.trim() ||
    process.env.CAPACITY_ALERT_EMAIL?.trim() ||
    process.env.EMAIL_REPLY_TO?.trim();
  return to || null;
}

export async function sendApiHealthAlertEmail(opts: {
  overall: string;
  findings: ApiHealthFinding[];
  metrics: IptvApiErrorMetrics;
}): Promise<{ ok: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const to = alertRecipient();

  if (!apiKey || !from || !to) {
    console.warn(
      "[api-health:alert] missing RESEND_API_KEY, EMAIL_FROM, or alert email"
    );
    return { ok: false, reason: "mail_not_configured" };
  }

  const elevated = opts.findings.filter((f) => f.id !== "healthy");
  const lines = elevated.length
    ? elevated.map(
        (f) =>
          `• [${f.signal.toUpperCase()}] ${f.title} (${f.count15m} in 15m)\n  ${f.detail}`
      )
    : ["• No detailed findings"];

  const counterLines = Object.entries(opts.metrics.last15Min)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `  ${k}: ${n}`)
    .join("\n");

  const body = [
    `Streamly API health alert — ${opts.overall.toUpperCase()}`,
    "",
    ...lines,
    "",
    "Error counters (last 15 min):",
    counterLines || "  (none)",
    "",
    "On the VPS:",
    "  cd /opt/stream/iptv-player && npm run monitor:health-report",
    "",
    "Check Sentry + browser Network tab for failing endpoints.",
    "",
    "— Streamly API health monitoring",
  ].join("\n");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[Streamly] API health ${opts.overall} — check IPTV errors`,
      text: body,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("[api-health:alert:resend]", res.status, text);
    return { ok: false, reason: `resend_${res.status}` };
  }

  return { ok: true };
}
