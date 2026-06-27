import type { CapacityReport } from "@/lib/capacity-report";
import type { CapacitySignal } from "@/lib/capacity-assess";

export type SendCapacityAlertResult =
  | { ok: true }
  | { ok: false; reason: "missing_config" | "upstream" | "no_recipient" };

const SUBJECT_PREFIX: Record<CapacitySignal, string> = {
  ok: "Streamly VPS OK",
  watch: "Streamly VPS — watch",
  upgrade_soon: "Streamly VPS — consider upgrading",
  upgrade_now: "Streamly VPS — upgrade recommended",
};

function alertRecipient(): string | null {
  const direct = process.env.CAPACITY_ALERT_EMAIL?.trim();
  if (direct) return direct;
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();
  if (replyTo) return replyTo;
  const legal = process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim();
  if (legal) return legal;
  return null;
}

function formatReportText(report: CapacityReport): string {
  const { assessment: a, vps } = report;
  const lines = [
    `Streamly VPS capacity alert`,
    ``,
    `Overall: ${a.overall.toUpperCase()}`,
    `Plan: ${vps.vcpu ?? "?"} vCPU · ${vps.ramGb ?? "?"} GB RAM · ${vps.bandwidthMbps ?? "?"} Mbps`,
    `Window: ${a.stats.sampleCount} samples (~${a.stats.windowHours}h)`,
    ``,
    `Stats (p95 unless noted)`,
    `  RAM:    ${a.stats.ramUsedPctP95.toFixed(0)}% (peak ${a.stats.ramUsedPctMax.toFixed(0)}%)`,
    `  CPU:    ${a.stats.cpuPctP95.toFixed(0)}%`,
    `  Disk:   ${a.stats.diskUsedPct.toFixed(0)}%`,
    `  Egress: ${a.stats.egressMbpsP95.toFixed(0)} Mbps (peak ${a.stats.egressMbpsPeak.toFixed(0)} Mbps)`,
    `  Streams: ~${a.stats.streamActiveP95.toFixed(0)} concurrent proxy`,
    ``,
    `Findings:`,
  ];
  for (const f of a.findings) {
    lines.push(`  [${f.signal}] ${f.title}`);
    lines.push(`    ${f.detail}`);
  }
  lines.push(
    ``,
    `On the VPS: cd /opt/stream/iptv-player && npm run monitor:report`,
    ``,
    `— Streamly capacity monitoring`
  );
  return lines.join("\n");
}

function formatReportHtml(report: CapacityReport): string {
  const text = formatReportText(report);
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return `<pre style="font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5">${escaped}</pre>`;
}

export async function sendCapacityAlertEmail(
  report: CapacityReport
): Promise<SendCapacityAlertResult> {
  const to = alertRecipient();
  if (!to) return { ok: false, reason: "no_recipient" };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!apiKey || !from) {
    console.warn("[capacity:alert] missing RESEND_API_KEY or EMAIL_FROM");
    return { ok: false, reason: "missing_config" };
  }

  const signal = report.assessment.overall;
  const subject = `${SUBJECT_PREFIX[signal]} (${report.vps.ramGb ?? "?"} GB VPS)`;
  const replyTo = process.env.EMAIL_REPLY_TO?.trim();

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text: formatReportText(report),
      html: formatReportHtml(report),
      ...(replyTo ? { reply_to: replyTo } : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[capacity:alert:resend]", res.status, body);
    return { ok: false, reason: "upstream" };
  }

  return { ok: true };
}
