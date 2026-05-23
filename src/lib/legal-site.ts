/**
 * Public legal / operator hints for /legal/* pages.
 * Set in production .env (NEXT_PUBLIC_* is baked at build time).
 */
export function legalContactEmail(): string | null {
  const v = process.env.NEXT_PUBLIC_LEGAL_CONTACT_EMAIL?.trim();
  return v && v.includes("@") ? v : null;
}

/** Canadian province for governing-law clause (e.g. Ontario). */
export function legalProvinceCanada(): string | null {
  const v = process.env.NEXT_PUBLIC_LEGAL_PROVINCE?.trim();
  return v || null;
}
