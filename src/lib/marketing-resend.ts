import "server-only";

function resendApiKey(): string | null {
  const key = process.env.RESEND_API_KEY?.trim();
  return key || null;
}

function marketingSegmentId(): string | null {
  const id = process.env.RESEND_MARKETING_SEGMENT_ID?.trim();
  return id || null;
}

export type ResendContactSyncResult =
  | { ok: true }
  | { ok: false; reason: "missing_config" | "upstream" };

async function resendFetch(
  path: string,
  init: RequestInit
): Promise<Response | null> {
  const apiKey = resendApiKey();
  if (!apiKey) return null;
  return fetch(`https://api.resend.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

/** Upsert a global Resend contact (optional segment). Best-effort — logs on failure. */
export async function syncMarketingContactToResend(opts: {
  email: string;
  firstName?: string | null;
  unsubscribed: boolean;
}): Promise<ResendContactSyncResult> {
  const apiKey = resendApiKey();
  if (!apiKey) return { ok: false, reason: "missing_config" };

  const segmentId = marketingSegmentId();
  const body: Record<string, unknown> = {
    email: opts.email,
    unsubscribed: opts.unsubscribed,
  };
  if (opts.firstName?.trim()) {
    body.first_name = opts.firstName.trim().slice(0, 80);
  }
  if (segmentId && !opts.unsubscribed) {
    body.segments = [{ id: segmentId }];
  }

  let res = await resendFetch("/contacts", {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!res) return { ok: false, reason: "missing_config" };

  if (res.ok) return { ok: true };

  if (res.status === 409 || res.status === 422) {
    const patchBody: Record<string, unknown> = {
      unsubscribed: opts.unsubscribed,
    };
    if (opts.firstName?.trim()) {
      patchBody.first_name = opts.firstName.trim().slice(0, 80);
    }
    res = await resendFetch(
      `/contacts/${encodeURIComponent(opts.email)}`,
      {
        method: "PATCH",
        body: JSON.stringify(patchBody),
      }
    );
    if (!res) return { ok: false, reason: "missing_config" };
    if (res.ok) return { ok: true };
  }

  const text = await res.text().catch(() => "");
  console.error("[marketing:resend:contact]", res.status, text);
  return { ok: false, reason: "upstream" };
}

export async function markMarketingContactUnsubscribedInResend(
  email: string
): Promise<ResendContactSyncResult> {
  return syncMarketingContactToResend({
    email,
    unsubscribed: true,
  });
}
