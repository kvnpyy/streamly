import type { IptvApiErrorMetrics } from "@/lib/iptv-api-error-metrics";

export type ApiHealthSignal = "ok" | "watch" | "alert";

export type ApiHealthFinding = {
  id: string;
  signal: ApiHealthSignal;
  title: string;
  detail: string;
  count15m: number;
};

const SIGNAL_RANK: Record<ApiHealthSignal, number> = {
  ok: 0,
  watch: 1,
  alert: 2,
};

function worst(a: ApiHealthSignal, b: ApiHealthSignal): ApiHealthSignal {
  return SIGNAL_RANK[a] >= SIGNAL_RANK[b] ? a : b;
}

type Rule = {
  id: string;
  category: keyof IptvApiErrorMetrics["last15Min"];
  watchAt: number;
  alertAt: number;
  title: string;
  detail: string;
};

const RULES: Rule[] = [
  {
    id: "missing_credentials_spike",
    category: "missing_credentials",
    watchAt: 12,
    alertAt: 40,
    title: "Many requests missing IPTV credentials",
    detail:
      "Clients are calling catalog/stream APIs without x-iptv-* headers. Often a session cookie decrypt failure, bootstrap race, or creds cleared after deploy. Users see empty libraries and HTTP 400.",
  },
  {
    id: "turnstile_login_blocked",
    category: "turnstile_required",
    watchAt: 15,
    alertAt: 50,
    title: "Turnstile blocking desktop logins",
    detail:
      "Auth probes are returning 400 without a Turnstile token. Users cannot connect on desktop until they complete the widget (or Turnstile is misconfigured).",
  },
  {
    id: "turnstile_verify_failed",
    category: "turnstile_failed",
    watchAt: 8,
    alertAt: 25,
    title: "Turnstile verification failures",
    detail:
      "Tokens are sent but Cloudflare rejects them — check site/secret key pairing and widget domain settings.",
  },
  {
    id: "provider_verify_failed",
    category: "provider_verify_failed",
    watchAt: 10,
    alertAt: 30,
    title: "IPTV credential verification failures",
    detail:
      "Saved-provider POST/PATCH cannot reach panels or panels reject logins. Users changing connection settings will see errors regardless of correct creds if VPS egress or URL format is wrong.",
  },
  {
    id: "stream_upstream_4xx",
    category: "stream_upstream_4xx",
    watchAt: 25,
    alertAt: 80,
    title: "High stream proxy 4xx from providers",
    detail:
      "Upstream IPTV servers are rejecting many playback URLs (400/403/404). May be bad server URL format, expired accounts, or provider blocking the proxy.",
  },
  {
    id: "catalog_upstream_error",
    category: "catalog_upstream_error",
    watchAt: 15,
    alertAt: 40,
    title: "Catalog upstream errors",
    detail:
      "Xtream catalog fetches are failing (502). VPS may not reach providers or panels are down.",
  },
];

export function assessApiHealth(metrics: IptvApiErrorMetrics): {
  overall: ApiHealthSignal;
  findings: ApiHealthFinding[];
} {
  const findings: ApiHealthFinding[] = [];
  let overall: ApiHealthSignal = "ok";

  for (const rule of RULES) {
    const count15m = metrics.last15Min[rule.category] ?? 0;
    if (count15m < rule.watchAt) continue;

    const signal: ApiHealthSignal =
      count15m >= rule.alertAt ? "alert" : "watch";
    overall = worst(overall, signal);
    findings.push({
      id: rule.id,
      signal,
      title: rule.title,
      detail: rule.detail,
      count15m,
    });
  }

  if (!findings.length) {
    findings.push({
      id: "healthy",
      signal: "ok",
      title: "No elevated IPTV API error rates",
      detail: "Error counters in the last 15 minutes are below alert thresholds.",
      count15m: 0,
    });
  }

  return { overall, findings };
}
