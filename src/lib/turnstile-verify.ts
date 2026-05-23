/** Verify Cloudflare Turnstile token (server-side). */
export async function verifyTurnstileToken(token: string): Promise<boolean> {
  const secret = process.env.STREAM_TURNSTILE_SECRET_KEY?.trim();
  if (!secret) return true;

  const trimmed = token.trim();
  if (!trimmed) return false;

  try {
    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", trimmed);

    const res = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
        cache: "no-store",
      }
    );
    const data = (await res.json().catch(() => null)) as {
      success?: boolean;
    } | null;
    return data?.success === true;
  } catch {
    return false;
  }
}
